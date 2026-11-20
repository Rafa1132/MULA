"""Connect an Agent Client Protocol client (Zed, VS Code, JetBrains…) to one Mula agent.

The editor starts this script and talks to it over stdin and stdout: newline-delimited JSON-RPC 2.0,
as the Agent Client Protocol specifies (https://agentclientprotocol.com). Each prompt is sent to the
Mula backend, which runs it as a normal turn of the agent (its persona, the owner's settings, memory
and tools) and streams the reply back; the reply reaches the editor as `session/update` chunks.

Set two environment variables in the editor's agent settings, never on the command line:

- MULA_CLIENT_KEY: a key created for the agent in My agents → Client access (shown once);
- MULA_URL: the backend, http://127.0.0.1:8000 unless Mula runs elsewhere.

Run it with the backend's Python: server/.venv/bin/python server/scripts/mula_acp.py
Supported: initialize, session/new, session/prompt (text and resource links), session/cancel.
Not supported: loading earlier sessions (the history lives in Mula), files, images and terminals.
Nothing goes to stdout except protocol messages; problems go to stderr without the key.
"""
import json
import os
import sys
import threading
import uuid

import httpx

PROTOCOL_VERSION = 1
DEFAULT_URL = "http://127.0.0.1:8000"
# JSON-RPC error codes: the standard ones, and the server-defined range for Mula's own failures.
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
MULA_ERROR = -32000
# The backend keeps one message to this many characters.
MESSAGE_LIMIT = 8000
TIMEOUT = httpx.Timeout(600, connect=10)


class Bridge:
    def __init__(self, base_url, key, output=sys.stdout):
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {key}"}
        self.output = output
        self.write_lock = threading.Lock()
        self.sessions = set()
        # Session id → the streaming response of its prompt in progress, closed by session/cancel.
        self.running = {}
        self.cancelled = set()
        self.state_lock = threading.Lock()

    def send(self, message):
        with self.write_lock:
            self.output.write(json.dumps(message, ensure_ascii=False) + "\n")
            self.output.flush()

    def reply(self, request_id, result):
        self.send({"jsonrpc": "2.0", "id": request_id, "result": result})

    def fail(self, request_id, code, message):
        self.send({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})

    def handle(self, message):
        """One incoming JSON-RPC message. A prompt runs on its own thread, so cancel can arrive."""
        method = message.get("method")
        request_id = message.get("id")
        params = message.get("params")
        if not isinstance(params, dict):
            params = {}
        if method == "initialize":
            self.reply(request_id, self.initialize())
        elif method == "session/new":
            self.reply(request_id, self.new_session())
        elif method == "session/prompt":
            threading.Thread(target=self.prompt, args=(request_id, params), daemon=True).start()
        elif method == "session/cancel":
            self.cancel(params.get("sessionId"))
        elif request_id is not None:
            self.fail(request_id, METHOD_NOT_FOUND, f"Mula does not support {method}.")

    def initialize(self):
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "agentCapabilities": {
                "loadSession": False,
                "promptCapabilities": {"image": False, "audio": False, "embeddedContext": False},
            },
            "authMethods": [],
        }

    def new_session(self):
        session_id = "mula_" + uuid.uuid4().hex
        with self.state_lock:
            self.sessions.add(session_id)
        return {"sessionId": session_id}

    def cancel(self, session_id):
        with self.state_lock:
            response = self.running.get(session_id)
            if response is None:
                return
            self.cancelled.add(session_id)
        # Closing the stream stops the turn on the backend, which keeps what arrived so far.
        response.close()

    def prompt(self, request_id, params):
        session_id = params.get("sessionId")
        with self.state_lock:
            known = session_id in self.sessions
            busy = session_id in self.running
        if not known:
            self.fail(request_id, INVALID_PARAMS, "Unknown session. Start a new one.")
            return
        if busy:
            self.fail(request_id, INVALID_PARAMS, "This session is still answering. Cancel it or wait.")
            return
        text = prompt_text(params.get("prompt"))
        if not text:
            self.fail(request_id, INVALID_PARAMS, "Send a text message.")
            return
        if len(text) > MESSAGE_LIMIT:
            self.fail(request_id, INVALID_PARAMS, f"Keep a message to {MESSAGE_LIMIT:,} characters.")
            return
        try:
            stop_reason = self.stream(session_id, text)
        except MulaError as error:
            self.fail(request_id, MULA_ERROR, str(error))
            return
        finally:
            with self.state_lock:
                self.running.pop(session_id, None)
        self.reply(request_id, {"stopReason": stop_reason})

    def stream(self, session_id, text):
        """Send one prompt to Mula and relay the reply; returns the ACP stop reason."""
        body = {"session_id": session_id, "message": text}
        try:
            with httpx.Client(timeout=TIMEOUT, follow_redirects=False) as client:
                with client.stream("POST", f"{self.base_url}/api/acp/prompt", json=body, headers=self.headers) as response:
                    with self.state_lock:
                        self.running[session_id] = response
                    if response.status_code != 200:
                        response.read()
                        raise MulaError(error_detail(response))
                    return self.relay(session_id, response)
        except httpx.HTTPError as error:
            if self.was_cancelled(session_id):
                return "cancelled"
            raise MulaError(f"Cannot reach Mula at {self.base_url}. Start it with ./run.sh.") from error

    def relay(self, session_id, response):
        stop_reason = "end_turn"
        try:
            for line in response.iter_lines():
                if not line.strip():
                    continue
                event = json.loads(line)
                if event.get("type") == "token" and isinstance(event.get("content"), str):
                    self.chunk(session_id, event["content"])
                elif event.get("type") == "error":
                    raise MulaError(str(event.get("detail") or "Mula could not answer."))
                elif event.get("type") == "done":
                    if event.get("truncated"):
                        stop_reason = "max_tokens"
                    return stop_reason
        except (httpx.HTTPError, ValueError) as error:
            if self.was_cancelled(session_id):
                return "cancelled"
            raise MulaError("Mula's reply ended unexpectedly.") from error
        if self.was_cancelled(session_id):
            return "cancelled"
        raise MulaError("Mula's reply ended before it finished.")

    def was_cancelled(self, session_id):
        with self.state_lock:
            if session_id in self.cancelled:
                self.cancelled.discard(session_id)
                return True
        return False

    def chunk(self, session_id, text):
        self.send({"jsonrpc": "2.0", "method": "session/update", "params": {
            "sessionId": session_id,
            "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": text}},
        }})


class MulaError(Exception):
    """A failure to show in the editor; the message never contains the key."""


def prompt_text(blocks):
    """The text of an ACP prompt: text blocks as they are, resource links by name and address."""
    if not isinstance(blocks, list):
        return ""
    parts = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and isinstance(block.get("text"), str):
            parts.append(block["text"])
        elif block.get("type") == "resource_link" and isinstance(block.get("uri"), str):
            name = block.get("name")
            if not isinstance(name, str):
                name = block["uri"]
            parts.append(f"[{name}]({block['uri']})")
    return "\n\n".join(part for part in parts if part.strip()).strip()


def error_detail(response):
    if response.status_code == 401:
        return "Mula refused this client key. Create a new one in My agents → Client access."
    try:
        detail = response.json().get("detail")
    except (ValueError, AttributeError):
        detail = None
    if isinstance(detail, str):
        return detail
    return f"Mula could not answer (HTTP {response.status_code})."


def main():
    key = os.environ.get("MULA_CLIENT_KEY", "").strip()
    if not key:
        print("Set MULA_CLIENT_KEY to a key from My agents → Client access.", file=sys.stderr)
        raise SystemExit(2)
    bridge = Bridge(os.environ.get("MULA_URL", DEFAULT_URL), key)
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except ValueError:
            print("Ignored a line that is not JSON.", file=sys.stderr)
            continue
        if isinstance(message, dict):
            bridge.handle(message)


if __name__ == "__main__":
    main()
