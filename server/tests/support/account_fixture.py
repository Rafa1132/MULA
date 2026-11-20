from unittest.mock import patch
from fastapi.testclient import TestClient
from src.common import config, profiles
from src.main import app
from tests.support.database_fixture import DatabaseFixture


class AccountFixture(DatabaseFixture):
    """A fresh database schema, a private runtime home, and one signed-in account with one open project."""

    def setUp(self):
        super().setUp()
        # Account profiles go to a private runtime home, never the developer's real one.
        self.runtime_home = self.data_dir / "hermes"
        for target, value in (("RUNTIME_HOME", self.runtime_home), ("KEY_SEED", "test-profile-seed")):
            patcher = patch.object(profiles, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        # The strict sign-up rules, whatever the developer's shell has set.
        relaxed = patch.object(config, "MULA_RELAXED_AUTH", False)
        relaxed.start()
        self.addCleanup(relaxed.stop)
        self.client = TestClient(app)
        response = self.client.post("/api/auth/signup", json={"username": "owner", "password": "long-password-123"})
        self.assertEqual(response.status_code, 201)
        self.account = response.json()
        # One project, opened by default: project routes need the X-Mula-Project header.
        response = self.client.post("/api/projects", json={"name": "Test business"})
        self.assertEqual(response.status_code, 201, response.text)
        self.project = response.json()
        self.client.headers["X-Mula-Project"] = self.project["id"]
        # The project's Operator conversation (the runtime session id), for tests that check it.
        self.project_conversation = self.client.get("/api/conversation").json()["session_id"]

    def open_new_project(self, client, name="Test business"):
        """Create a project as the account signed in on `client`, and send it with every request."""
        response = client.post("/api/projects", json={"name": name})
        self.assertEqual(response.status_code, 201, response.text)
        project = response.json()
        client.headers["X-Mula-Project"] = project["id"]
        return project

    def switch_to_new_account(self, username, client=None):
        """Sign `client` (default: self.client) up as another account, in a project of its own."""
        if client is None:
            client = self.client
        response = client.post("/api/auth/signup", json={"username": username, "password": "long-password-123"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json(), self.open_new_project(client)
