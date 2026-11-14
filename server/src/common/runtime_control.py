"""Ask the running Mula runtime (the Hermes gateway) whether it serves a profile, and to serve it now.

The gateway serves every profile folder under the runtime home, but it only discovers a new folder on
its periodic rescan (every 30 seconds at the pinned revision). A turn sent to a profile before that
rescan passes the gateway's HTTP checks and then fails inside the agent task with ``profile_mismatch``.
Two things close that gap, and both are read here:

- ``<home>/gateway_state.json`` records the ``served_profiles`` list of the gateway that wrote it.
- The gateway's control socket (``<home>/gateway.sock``, or the path written in
  ``<home>/gateway.sock.path`` when the home path is too long for a socket) answers the
  ``rescan-profiles`` verb by reconciling the profile folders right away and returning the served list.
  This is what the runtime's own ``hermes profile create`` command does.

The wire protocol is one JSON object per line, protocol version 1, as in the runtime's
``gateway/control_socket.py``. Every failure here means "no gateway answered"; the caller decides what
that means for the turn. Nothing in this module raises for a missing or silent gateway.
"""
import json
import os
from pathlib import Path
import socket
import time

PROTOCOL_VERSION = 1
SOCKET_NAME = "gateway.sock"
POINTER_NAME = "gateway.sock.path"
STATE_NAME = "gateway_state.json"
# The gateway waits up to five seconds for the reconcile before answering; leave room for that.
RESCAN_TIMEOUT = 8.0
MAX_RESPONSE_BYTES = 512 * 1024


def socket_path(home: Path) -> Path | None:
    """Where the gateway serving ``home`` listens for control requests, or None when nothing exists."""
    direct = home / SOCKET_NAME
    try:
        if direct.exists():
            return direct
        pointer = home / POINTER_NAME
        if pointer.is_file():
            target = pointer.read_text(encoding="utf-8-sig").strip()
            if target and Path(target).exists():
                return Path(target)
    except OSError:
        return None
    return None


def served_profiles(home: Path) -> list[str] | None:
    """The served list recorded by a gateway that is still running, or None when there is none."""
    try:
        state = json.loads((home / STATE_NAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(state, dict):
        return None
    served = state.get("served_profiles")
    pid = state.get("pid")
    if not isinstance(served, list) or not isinstance(pid, int):
        return None
    if not process_alive(pid):
        # A gateway that exited leaves its last state file behind; it serves nothing now.
        return None
    return [name for name in served if isinstance(name, str)]


def process_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # The process exists but belongs to another user; it is running.
        return True
    return True


def rescan_profiles(home: Path, timeout: float = RESCAN_TIMEOUT) -> list[str] | None:
    """Ask the gateway to reconcile the profile folders now. Returns the served list, or None when
    no gateway answered. A gateway still connecting a profile answers with the list so far."""
    path = socket_path(home)
    if path is None:
        return None
    request = json.dumps({"verb": "rescan-profiles", "id": 1, "protocol": PROTOCOL_VERSION}).encode("utf-8") + b"\n"
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(timeout)
            connection.connect(str(path))
            connection.sendall(request)
            raw = read_line(connection, time.monotonic() + timeout)
    except OSError:
        return None
    if raw is None:
        return None
    try:
        response = json.loads(raw.decode("utf-8"))
    except ValueError:
        return None
    if not isinstance(response, dict) or response.get("ok") is not True:
        return None
    result = response.get("result")
    if not isinstance(result, dict) or not isinstance(result.get("served_profiles"), list):
        return None
    return [name for name in result["served_profiles"] if isinstance(name, str)]


def read_line(connection: socket.socket, deadline: float) -> bytes | None:
    chunks = []
    total = 0
    while time.monotonic() < deadline:
        chunk = connection.recv(65536)
        chunks.append(chunk)
        total += len(chunk)
        if not chunk or b"\n" in chunk:
            break
        if total > MAX_RESPONSE_BYTES:
            return None
    line = b"".join(chunks).partition(b"\n")[0]
    if not line:
        return None
    return line


def ensure_served(home: Path, name: str, wait_seconds: float) -> bool | None:
    """Make a running gateway serve ``name`` before a turn is sent to it.

    Returns True when the gateway serves the profile, False when a gateway answered and still does not
    serve it after ``wait_seconds``, and None when no gateway answered at all (not running, or a home
    this backend cannot reach). Only the False case is a reason to refuse the turn; with None the
    turn fails on its own connection error, as it always did.
    """
    served = served_profiles(home)
    if served is not None and name in served:
        return True
    answer = rescan_profiles(home)
    if answer is None:
        return None
    if name in answer:
        return True
    # The gateway is still bringing the profile up; its state file shows when it is done.
    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        time.sleep(0.25)
        served = served_profiles(home)
        if served is not None and name in served:
            return True
    return False
