import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from src.common import profiles
from src.features.auth import accounts
from src.features.operator import runtime
from src.main import app
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response


class ProfileDerivationTests(unittest.TestCase):
    def test_names_and_keys_are_derived_never_stored(self):
        account_id = str(uuid4())
        with patch.object(profiles, "KEY_SEED", "seed-one"):
            name = profiles.profile_name(account_id)
            key = profiles.profile_key(account_id)
            self.assertEqual(name, profiles.profile_name(account_id))
            self.assertEqual(key, profiles.profile_key(account_id))
            self.assertNotEqual(key, profiles.profile_key(str(uuid4())))
            self.assertEqual(profiles.profile_base_url("http://127.0.0.1:8642", account_id), f"http://127.0.0.1:8642/p/{name}")
        self.assertTrue(profiles.PROFILE_ID.match(name))
        self.assertTrue(name.startswith("mula-"))
        with patch.object(profiles, "KEY_SEED", "seed-two"):
            self.assertNotEqual(key, profiles.profile_key(account_id))
        with patch.object(profiles, "KEY_SEED", ""), self.assertRaises(profiles.ProfileError):
            profiles.profile_key(account_id)
        with self.assertRaises(ValueError):
            profiles.profile_name("../not-an-account")


class ProfileFilesTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.home = Path(directory.name) / "hermes"
        self.home.mkdir()
        (self.home / ".env").write_text("API_SERVER_KEY=root-key\nMULA_TOOLS_KEY=tools-key\nANTHROPIC_API_KEY=sk-ant-api03-test\n")
        for target, value in (("RUNTIME_HOME", self.home), ("KEY_SEED", "test-seed")):
            patcher = patch.object(profiles, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.account_id = str(uuid4())

    def env(self, folder):
        return profiles.env_values(folder / ".env")

    def test_profile_has_its_own_key_mirrored_secrets_and_memory_off(self):
        folder = profiles.ensure_profile(self.account_id)
        self.assertEqual(folder, self.home / "profiles" / profiles.profile_name(self.account_id))
        self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
        for name in ("config.yaml", ".env", "SOUL.md", profiles.NO_SKILLS_MARKER):
            self.assertEqual((folder / name).stat().st_mode & 0o777, 0o600, name)
        # Mula's identity replaces the runtime's own coding-agent identity.
        self.assertEqual((folder / "SOUL.md").read_text(), profiles.IDENTITY.read_text())
        self.assertNotIn("Hermes Agent", (folder / "SOUL.md").read_text())
        env = self.env(folder)
        self.assertEqual(env["API_SERVER_KEY"], profiles.profile_key(self.account_id))
        self.assertNotEqual(env["API_SERVER_KEY"], "root-key")
        self.assertEqual(env["MULA_TOOLS_KEY"], "tools-key")
        self.assertEqual(env["ANTHROPIC_API_KEY"], "sk-ant-api03-test")
        self.assertEqual((folder / "config.yaml").read_text(), profiles.TEMPLATE.read_text())
        self.assertTrue(profiles.profile_memory_is_off(folder))
        self.assertEqual(profiles.profiles_with_runtime_memory(), [])
        # Refreshing picks up a changed root secret and keeps everything else identical.
        (self.home / ".env").write_text("API_SERVER_KEY=root-key\nMULA_TOOLS_KEY=new-tools-key\n")
        # A runtime-seeded identity is replaced on the next refresh too.
        (folder / "SOUL.md").write_text("You are Hermes Agent, built by Nous Research.\n")
        profiles.ensure_profile(self.account_id)
        self.assertEqual((folder / "SOUL.md").read_text(), profiles.IDENTITY.read_text())
        env = self.env(folder)
        self.assertEqual(env["MULA_TOOLS_KEY"], "new-tools-key")
        self.assertNotIn("ANTHROPIC_API_KEY", env)
        self.assertEqual(env["API_SERVER_KEY"], profiles.profile_key(self.account_id))

    def test_profiles_with_runtime_memory_on_are_detected_and_block_startup(self):
        folder = profiles.ensure_profile(self.account_id)
        (folder / "config.yaml").write_text("memory:\n  memory_enabled: true\n")
        self.assertEqual(profiles.profiles_with_runtime_memory(), [folder.name])
        with self.assertRaises(RuntimeError):
            with TestClient(app):
                pass
        profiles.ensure_profile(self.account_id)
        self.assertEqual(profiles.profiles_with_runtime_memory(), [])

    def test_template_without_memory_off_is_refused(self):
        with patch.object(profiles, "TEMPLATE", self.home / "bad.yaml"):
            (self.home / "bad.yaml").write_text("memory:\n  memory_enabled: true\n")
            with self.assertRaises(profiles.ProfileError):
                profiles.ensure_profile(self.account_id)
        self.assertFalse(profiles.profile_dir(self.account_id).joinpath("config.yaml").exists())


class ProfileIsolationTests(AccountFixture, unittest.TestCase):
    def runtime_like(self, requests):
        """A stand-in gateway with the runtime's rule: a profile accepts only its own key."""
        def handler(request):
            requests.append(request)
            prefix, _, _ = request.url.path.partition("/v1/")
            name = prefix.removeprefix("/p/")
            expected = None
            for account_id in self.account_ids:
                if profiles.profile_name(account_id) == name:
                    expected = "Bearer " + profiles.profile_key(account_id)
            if expected is None or request.headers.get("Authorization") != expected:
                return httpx.Response(401, json={"error": "unauthorized"})
            return stream_response(answer("Hello from your profile."))
        return handler

    def test_each_account_reaches_only_its_own_profile(self):
        _, other = accounts.create_account("other", "other-long-password")
        self.account_ids = [self.account["id"], other["id"]]
        requests = []
        with gateway(self.runtime_like(requests)):
            response = self.client.post("/api/agents/operator/chat", json={"message": "Hi"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["reply"], "Hello from your profile.")
        self.assertEqual(requests[0].url.path, f"/p/{profiles.profile_name(self.account['id'])}/v1/chat/completions")
        # Both profiles exist on disk, each with its own key; a signup provisions it.
        for account_id in self.account_ids:
            folder = profiles.profile_dir(account_id)
            self.assertTrue((folder / "config.yaml").is_file())
            self.assertEqual(profiles.env_values(folder / ".env")["API_SERVER_KEY"], profiles.profile_key(account_id))
        self.assertNotEqual(profiles.profile_key(self.account["id"]), profiles.profile_key(other["id"]))

        # One account's key against another's profile is refused, as the runtime does.
        async def cross_call():
            headers = runtime.request_headers(None, "operator", self.account["id"])
            # Inside `gateway`, the client already carries the stand-in transport.
            async with httpx.AsyncClient() as client:
                return await client.get(profiles.profile_base_url("http://runtime", other["id"]) + "/v1/models", headers=headers)
        with gateway(self.runtime_like(requests)):
            self.assertEqual(asyncio.run(cross_call()).status_code, 401)

    def test_turns_are_refused_without_the_profile_seed(self):
        with patch.object(profiles, "KEY_SEED", ""), gateway(lambda request: stream_response(answer())):
            response = self.client.post("/api/agents/operator/chat", json={"message": "Hi"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("not set up", response.json()["detail"])

    def test_sessions_and_memory_stay_with_the_account(self):
        self.client.post("/api/memory/entries", json={"target": "business", "fact": "Only the owner should see this supplier note."})
        TestClient(app).post("/api/auth/signup", json={"username": "second", "password": "second-long-password"})
        other = TestClient(app)
        other.post("/api/auth/login", json={"username": "second", "password": "second-long-password"})
        self.assertNotIn("supplier note", json.dumps(other.get("/api/memory").json()))
        self.assertEqual(other.post("/api/memory/entries/1/retire").status_code, 404)


class FakeControlSocket:
    """A stand-in for the gateway's control socket: answers one rescan-profiles request per connection."""

    def __init__(self, path: Path, served: list[str]):
        import socket
        import threading
        self.requests = []
        self.served = served
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.bind(str(path))
        self.listener.listen(2)
        self.listener.settimeout(5)
        self.stopping = False
        self.thread = threading.Thread(target=self.serve, daemon=True)
        self.thread.start()

    def serve(self):
        import socket
        while not self.stopping:
            try:
                connection, _ = self.listener.accept()
            except (socket.timeout, OSError):
                continue
            with connection:
                self.requests.append(json.loads(connection.recv(65536).decode("utf-8")))
                reply = {"ok": True, "protocol": 1, "result": {"multiplex": True, "served_profiles": self.served}}
                connection.sendall(json.dumps(reply).encode("utf-8") + b"\n")

    def close(self):
        self.stopping = True
        self.listener.close()


class ProfileServingTests(unittest.TestCase):
    """A new profile folder is served only after the gateway rescans; the backend asks for that rescan."""

    def setUp(self):
        from src.common import runtime_control
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.home = Path(directory.name) / "hermes"
        self.home.mkdir()
        (self.home / ".env").write_text("API_SERVER_KEY=root-key\n")
        for target, value in (("RUNTIME_HOME", self.home), ("KEY_SEED", "test-seed"), ("SERVE_WAIT_SECONDS", 0.6)):
            patcher = patch.object(profiles, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.control = runtime_control
        self.account_id = str(uuid4())
        self.name = profiles.profile_name(self.account_id)

    def write_state(self, served, pid=None):
        import os
        if pid is None:
            pid = os.getpid()
        (self.home / "gateway_state.json").write_text(json.dumps({"pid": pid, "served_profiles": served}))

    def test_without_a_gateway_nothing_is_known_and_the_turn_proceeds(self):
        self.assertIsNone(self.control.ensure_served(self.home, self.name, 0.1))
        self.assertTrue(runtime.account_base_url(self.account_id).endswith(f"/p/{self.name}"))

    def test_state_file_of_a_running_gateway_is_enough(self):
        self.write_state(["default", self.name])
        self.assertTrue(self.control.ensure_served(self.home, self.name, 0.1))

    def test_state_file_of_an_exited_gateway_is_ignored(self):
        self.write_state(["default", self.name], pid=2**22 - 7)
        self.assertIsNone(self.control.served_profiles(self.home))
        self.assertIsNone(self.control.ensure_served(self.home, self.name, 0.1))

    def test_rescan_request_makes_the_gateway_serve_the_profile(self):
        self.write_state(["default"])
        fake = FakeControlSocket(self.home / "gateway.sock", ["default", self.name])
        self.addCleanup(fake.close)
        self.assertTrue(runtime.account_base_url(self.account_id).endswith(f"/p/{self.name}"))
        self.assertEqual(fake.requests, [{"verb": "rescan-profiles", "id": 1, "protocol": 1}])

    def test_socket_pointer_file_is_followed(self):
        target = self.home / "elsewhere.sock"
        (self.home / "gateway.sock.path").write_text(f"{target}\n")
        fake = FakeControlSocket(target, ["default", self.name])
        self.addCleanup(fake.close)
        self.assertEqual(self.control.rescan_profiles(self.home), ["default", self.name])

    def test_gateway_that_will_not_serve_the_profile_refuses_the_turn(self):
        self.write_state(["default"])
        fake = FakeControlSocket(self.home / "gateway.sock", ["default"])
        self.addCleanup(fake.close)
        with self.assertRaises(runtime.HermesError) as failure:
            runtime.account_base_url(self.account_id)
        self.assertIn("not started serving", str(failure.exception))
        self.assertEqual(len(fake.requests), 1)

    def test_pending_rescan_is_resolved_by_the_state_file(self):
        import threading
        fake = FakeControlSocket(self.home / "gateway.sock", ["default"])
        self.addCleanup(fake.close)
        timer = threading.Timer(0.2, self.write_state, args=(["default", self.name],))
        timer.start()
        self.addCleanup(timer.cancel)
        self.assertTrue(self.control.ensure_served(self.home, self.name, 2.0))

    def test_signup_asks_the_gateway_to_rescan(self):
        fake = FakeControlSocket(self.home / "gateway.sock", ["default"])
        self.addCleanup(fake.close)
        with patch.object(profiles, "RUNTIME_HOME", self.home):
            profiles.announce_profile(self.account_id)
        self.assertEqual([request["verb"] for request in fake.requests], ["rescan-profiles"])


class ProfileWriteOrderTests(unittest.TestCase):
    """Nothing is written for an account whose key cannot be derived (this happened on a real
    install that ran the new code before provisioning: a folder with a config and no key)."""

    def test_missing_seed_leaves_no_folder_behind(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        home = Path(directory.name) / "hermes"
        home.mkdir()
        with patch.object(profiles, "RUNTIME_HOME", home), patch.object(profiles, "KEY_SEED", ""):
            with self.assertRaises(profiles.ProfileError):
                profiles.ensure_profile(str(uuid4()))
        self.assertFalse((home / "profiles").exists())
