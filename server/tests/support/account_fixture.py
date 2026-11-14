from pathlib import Path
import tempfile
from unittest.mock import patch
from fastapi.testclient import TestClient
from src.common import profiles
from src.main import app


class AccountFixture:
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        database = patch("src.features.auth.service.DB_PATH", Path(temporary.name) / "accounts.sqlite3")
        database.start()
        self.addCleanup(database.stop)
        # Account profiles go to a private runtime home, never the developer's real one.
        self.runtime_home = Path(temporary.name) / "hermes"
        for target, value in (("RUNTIME_HOME", self.runtime_home), ("KEY_SEED", "test-profile-seed")):
            patcher = patch.object(profiles, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        response = self.client.post("/api/auth/signup", json={"username": "owner", "password": "long-password-123"})
        self.assertEqual(response.status_code, 201)
        self.account = response.json()
