from unittest.mock import patch
from fastapi.testclient import TestClient
from src.common import profiles
from src.main import app
from tests.support.database_fixture import DatabaseFixture


class AccountFixture(DatabaseFixture):
    """A fresh database schema, a private runtime home, and one signed-in account."""

    def setUp(self):
        super().setUp()
        # Account profiles go to a private runtime home, never the developer's real one.
        self.runtime_home = self.data_dir / "hermes"
        for target, value in (("RUNTIME_HOME", self.runtime_home), ("KEY_SEED", "test-profile-seed")):
            patcher = patch.object(profiles, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        response = self.client.post("/api/auth/signup", json={"username": "owner", "password": "long-password-123"})
        self.assertEqual(response.status_code, 201)
        self.account = response.json()
