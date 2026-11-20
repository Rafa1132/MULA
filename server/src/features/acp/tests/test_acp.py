"""Client keys, the client routes, and the stdio bridge that speaks the Agent Client Protocol."""
import io
import json
import unittest
from unittest.mock import patch
from uuid import UUID, uuid5

import httpx

# First: it imports the agents' routes, which load the modules below in the order the app does.
from src.features.agents.tests.test_agents import AgentFixture, events
from src.features.acp import service as keys
from src.features.agents import service as agents
from src.features.auth import accounts
from scripts import mula_acp
from tests.support.runtime_fixture import answer, gateway, stream_response


class KeyTests(AgentFixture, unittest.TestCase):
    def create(self, agent_id="operator", label="Zed on my laptop"):
        return self.client.post(f"/api/team/{agent_id}/client-keys", json={"label": label})

    def test_a_key_is_shown_once_and_stored_as_a_hash(self):
        created = self.create()
        self.assertEqual(created.status_code, 201, created.text)
        secret = created.json()["secret"]
        self.assertTrue(secret.startswith(keys.KEY_PREFIX))
        listed = self.client.get("/api/team/operator/client-keys").json()["keys"]
        self.assertEqual([(key["label"], key["revoked_at"]) for key in listed], [("Zed on my laptop", None)])
        self.assertNotIn(secret, json.dumps(listed))
        with accounts.database() as db:
            stored = db.execute("SELECT key_hash FROM client_keys").fetchone()["key_hash"]
        self.assertEqual(stored, keys.key_hash(secret))
        self.assertNotIn("key_hash", listed[0])
        # Keys belong to one agent.
        self.assertEqual(self.client.get("/api/team/forecasting/client-keys").json()["keys"], [])

    def test_labels_and_limits(self):
        self.assertEqual(self.create(label="   ").status_code, 422)
        self.assertEqual(self.create(label="x" * 61).status_code, 422)
        self.assertEqual(self.create(agent_id="inventory").status_code, 404)
        with patch.object(keys, "MAX_ACTIVE_KEYS", 2):
            first = self.create().json()["key"]
            self.create()
            self.assertEqual(self.create().status_code, 409)
            self.client.delete(f"/api/team/operator/client-keys/{first['id']}")
            self.assertEqual(self.create().status_code, 201)

    def test_revoked_wrong_and_foreign_keys_are_refused_alike(self):
        created = self.create().json()
        headers = {"Authorization": f"Bearer {created['secret']}"}
        opened = self.client.get("/api/acp/agent", headers=headers)
        self.assertEqual(opened.status_code, 200, opened.text)
        self.assertEqual((opened.json()["agent_id"], opened.json()["card"]["name"]), ("operator", "Operator"))
        for bad in ({}, {"Authorization": "Bearer nope"}, {"Authorization": created["secret"]}, {"Authorization": "Bearer " + keys.KEY_PREFIX + "made-up"}):
            with self.subTest(headers=bad):
                self.assertEqual(self.client.get("/api/acp/agent", headers=bad).status_code, 401)
        revoked = self.client.delete(f"/api/team/operator/client-keys/{created['key']['id']}").json()["key"]
        self.assertIsNotNone(revoked["revoked_at"])
        self.assertEqual(self.client.get("/api/acp/agent", headers=headers).status_code, 401)
        # Another account can't see or revoke this project's keys.
        other = self.create().json()
        self.switch_to_new_account("other")
        self.assertEqual(self.client.delete(f"/api/team/operator/client-keys/{other['key']['id']}").status_code, 404)
        self.assertEqual(self.client.get("/api/acp/agent", headers={"Authorization": f"Bearer {other['secret']}"}).status_code, 200)

    def test_a_key_closes_when_its_project_is_archived(self):
        secret = self.create().json()["secret"]
        with accounts.database() as db:
            db.execute("UPDATE projects SET archived_at = now() WHERE id = %s", (self.project["id"],))
        self.assertEqual(self.client.get("/api/acp/agent", headers={"Authorization": f"Bearer {secret}"}).status_code, 401)


class ClientTurnTests(AgentFixture, unittest.TestCase):
    def key(self, agent_id):
        return {"Authorization": "Bearer " + self.client.post(f"/api/team/{agent_id}/client-keys", json={"label": "Editor"}).json()["secret"]}

    def test_an_operator_turn_from_a_client_has_its_own_session_and_cannot_delegate(self):
        captured = []

        def handler(request):
            captured.append(request)
            return stream_response(answer("Hello from Mula."))
        headers = self.key("operator")
        with gateway(handler):
            response = self.client.post("/api/acp/prompt", json={"session_id": "mula_abc", "message": "Hi"}, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["content"] for item in events(response) if item["type"] == "token"], ["Hello from Mula."])
        session = uuid5(UUID(self.project_conversation), "acp:operator:mula_abc")
        self.assertEqual(captured[0].headers["X-Hermes-Session-Id"], f"mula-operator-{session}")
        system = json.loads(captured[0].content)["messages"][0]["content"]
        self.assertIn(agents.CLIENT_LINE, system)
        messages = self.client.get("/api/conversation").json()["messages"]
        self.assertEqual((messages[-2]["text"], messages[-2]["note"]), ("Hi", "Sent from a connected client (ACP)"))
        self.assertEqual(messages[-1]["text"], "Hello from Mula.")
        # The turn's ticket cannot ask another agent.
        ticket = json.loads(captured[0].content)["messages"][0]["content"].split("Mula tool call: ")[1].split()[0]
        with self.assertRaises(agents.ToolDenied):
            agents.ask_agent(ticket, "forecasting", "Forecast")

    def test_a_forecasting_key_reaches_forecasting(self):
        captured = []

        def handler(request):
            captured.append(request)
            return stream_response(answer("Send me a CSV."))
        with gateway(handler):
            self.client.post("/api/acp/prompt", json={"session_id": "s1", "message": "Forecast"}, headers=self.key("forecasting"))
        self.assertIn("-forecasting/v1/", str(captured[0].url))
        self.assertEqual(accounts.history(self.project["id"], "forecasting")[-1]["text"], "Send me a CSV.")

    def test_bad_prompts_are_refused(self):
        headers = self.key("operator")
        for body in ({"session_id": "s1", "message": "   "}, {"session_id": "../x", "message": "Hi"}, {"session_id": "s1", "message": "x" * 8001},
                     {"session_id": "s1", "message": "Hi", "extra": 1}):
            with self.subTest(body=str(body)[:40]):
                self.assertEqual(self.client.post("/api/acp/prompt", json=body, headers=headers).status_code, 422)
        self.assertEqual(self.client.post("/api/acp/prompt", json={"session_id": "s1", "message": "Hi"}).status_code, 401)


class BridgeTests(unittest.TestCase):
    """The stdio side, with the Mula backend faked."""

    def setUp(self):
        self.output = io.StringIO()
        self.bridge = mula_acp.Bridge("http://mula.test", "mula_acp_test-key", self.output)
        self.requests = []

    def messages(self):
        return [json.loads(line) for line in self.output.getvalue().splitlines()]

    def backend(self, handler):
        transport = httpx.MockTransport(handler)
        client = httpx.Client
        return patch.object(mula_acp.httpx, "Client", side_effect=lambda **kwargs: client(transport=transport, **kwargs))

    def ndjson(self, *items):
        return httpx.Response(200, text="".join(json.dumps(item) + "\n" for item in items), headers={"content-type": "application/x-ndjson"})

    def test_initialize_session_and_a_streamed_prompt(self):
        self.bridge.handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": 1}})
        self.bridge.handle({"jsonrpc": "2.0", "id": 2, "method": "session/new", "params": {"cwd": "/tmp", "mcpServers": []}})
        initialized, created = self.messages()
        self.assertEqual(initialized["result"]["protocolVersion"], 1)
        self.assertFalse(initialized["result"]["agentCapabilities"]["loadSession"])
        session_id = created["result"]["sessionId"]

        def handler(request):
            self.requests.append(request)
            return self.ndjson({"type": "session"}, {"type": "token", "content": "Hel"}, {"type": "token", "content": "lo"}, {"type": "done", "truncated": False})
        with self.backend(handler):
            self.bridge.prompt(3, {"sessionId": session_id, "prompt": [{"type": "text", "text": "Hi"}, {"type": "resource_link", "uri": "file:///a.txt", "name": "a.txt"}]})
        sent = json.loads(self.requests[0].content)
        self.assertEqual(sent, {"session_id": session_id, "message": "Hi\n\n[a.txt](file:///a.txt)"})
        self.assertEqual(self.requests[0].headers["Authorization"], "Bearer mula_acp_test-key")
        updates = self.messages()[2:]
        self.assertEqual([update["params"]["update"]["content"]["text"] for update in updates[:-1]], ["Hel", "lo"])
        self.assertEqual(updates[0]["method"], "session/update")
        self.assertEqual(updates[-1], {"jsonrpc": "2.0", "id": 3, "result": {"stopReason": "end_turn"}})

    def test_failures_are_errors_without_the_key(self):
        session_id = self.bridge.new_session()["sessionId"]
        with self.backend(lambda request: httpx.Response(401, json={"detail": "no"})):
            self.bridge.prompt(1, {"sessionId": session_id, "prompt": [{"type": "text", "text": "Hi"}]})
        with self.backend(lambda request: self.ndjson({"type": "error", "detail": "Hermes timed out."})):
            self.bridge.prompt(2, {"sessionId": session_id, "prompt": [{"type": "text", "text": "Hi"}]})
        self.bridge.prompt(3, {"sessionId": "unknown", "prompt": [{"type": "text", "text": "Hi"}]})
        self.bridge.prompt(4, {"sessionId": session_id, "prompt": []})
        self.bridge.handle({"jsonrpc": "2.0", "id": 5, "method": "fs/read_text_file", "params": {}})
        replies = self.messages()
        self.assertIn("My agents", replies[0]["error"]["message"])
        self.assertEqual(replies[1]["error"]["message"], "Hermes timed out.")
        self.assertEqual([reply["error"]["code"] for reply in replies[2:]], [mula_acp.INVALID_PARAMS, mula_acp.INVALID_PARAMS, mula_acp.METHOD_NOT_FOUND])
        self.assertNotIn("test-key", self.output.getvalue())

    def test_truncated_and_cancelled_turns_say_so(self):
        session_id = self.bridge.new_session()["sessionId"]
        with self.backend(lambda request: self.ndjson({"type": "token", "content": "Long"}, {"type": "done", "truncated": True})):
            self.bridge.prompt(1, {"sessionId": session_id, "prompt": [{"type": "text", "text": "Hi"}]})
        self.assertEqual(self.messages()[-1]["result"], {"stopReason": "max_tokens"})

        class Running:
            closed = False

            def close(self):
                self.closed = True
        running = Running()
        self.bridge.running[session_id] = running
        self.bridge.cancel(session_id)
        self.assertTrue(running.closed)
        self.assertTrue(self.bridge.was_cancelled(session_id))
        # A cancel for a session that isn't answering changes nothing.
        self.bridge.cancel("other")
        self.assertFalse(self.bridge.was_cancelled("other"))


if __name__ == "__main__":
    unittest.main()
