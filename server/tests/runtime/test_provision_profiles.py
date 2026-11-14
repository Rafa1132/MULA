import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import yaml

from scripts import provision_profiles
from src.common import database, profiles
from tests.support.database_fixture import DatabaseFixture

CONFIG = "model:\n  default: huihui_ai/qwen3-abliterated:latest\ngateway:\n  api_server:\n    port: 8642\n"


class ProvisionProfilesTests(DatabaseFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        self.backend = root / "server"
        self.backend.mkdir()
        (self.backend / ".env.hermes").write_text("HERMES_API_KEY=gateway-key\nMULA_TOOLS_KEY=tools-key\n")
        self.home = root / "hermes"
        self.home.mkdir()
        (self.home / "config.yaml").write_text(CONFIG)
        (self.home / ".env").write_text("API_SERVER_KEY=gateway-key\nMULA_TOOLS_KEY=tools-key\n")
        self.ids = [str(uuid4()), str(uuid4())]
        with database.database() as db:
            for index, account_id in enumerate(self.ids):
                db.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id) VALUES (%s, %s, 'salt', 'hash', %s)",
                           (account_id, f"owner{index}", str(uuid4())))
        for module, name, value in ((provision_profiles, "BACKEND", self.backend), (provision_profiles, "RUNTIME_HOME", self.home)):
            patcher = patch.object(module, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        # The script reads the database from the process environment first, as a rehearsal would.
        env = patch.dict("os.environ", {"MULA_DATABASE_URL": database.DATABASE_URL, "MULA_DATABASE_SCHEMA": self.schema})
        env.start()
        self.addCleanup(env.stop)

    def run_script(self, *arguments):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            provision_profiles.main(list(arguments))
        return output.getvalue()

    def test_dry_run_reports_without_writing(self):
        before = (self.backend / ".env.hermes").read_text()
        output = self.run_script()
        self.assertIn("Accounts: 2. Without a profile: 2.", output)
        self.assertIn("seed in server/.env.hermes: missing", output)
        self.assertIn("multiplex_profiles: off", output)
        self.assertEqual((self.backend / ".env.hermes").read_text(), before)
        self.assertEqual((self.home / "config.yaml").read_text(), CONFIG)
        self.assertFalse((self.home / "profiles").exists())

    def test_apply_writes_seed_flag_and_one_profile_per_account(self):
        output = self.run_script("--apply")
        seed = profiles.env_values(self.backend / ".env.hermes")["MULA_PROFILE_KEY_SEED"]
        self.assertGreaterEqual(len(seed), 32)
        self.assertNotIn(seed, output)
        self.assertTrue(yaml.safe_load((self.home / "config.yaml").read_text())["gateway"]["multiplex_profiles"])
        with patch.object(profiles, "KEY_SEED", seed), patch.object(profiles, "RUNTIME_HOME", self.home):
            for account_id in self.ids:
                folder = profiles.profile_dir(account_id)
                env = profiles.env_values(folder / ".env")
                self.assertEqual(env["API_SERVER_KEY"], profiles.profile_key(account_id))
                self.assertEqual(env["MULA_TOOLS_KEY"], "tools-key")
                self.assertNotIn(env["API_SERVER_KEY"], output)
                self.assertTrue(profiles.profile_memory_is_off(folder))
        # A second run keeps the seed and reports nothing missing.
        again = self.run_script()
        self.assertIn("Without a profile: 0.", again)
        self.assertEqual(profiles.env_values(self.backend / ".env.hermes")["MULA_PROFILE_KEY_SEED"], seed)

    def test_refresh_mirrors_changed_root_secrets(self):
        self.assertEqual(provision_profiles.refresh_existing_profiles(self.backend / ".env.hermes", self.home), -1)
        self.run_script("--apply")
        (self.home / ".env").write_text("API_SERVER_KEY=gateway-key\nMULA_TOOLS_KEY=tools-key\nANTHROPIC_API_KEY=sk-ant-api03-x\n")
        self.assertEqual(provision_profiles.refresh_existing_profiles(self.backend / ".env.hermes", self.home), 2)
        seed = profiles.env_values(self.backend / ".env.hermes")["MULA_PROFILE_KEY_SEED"]
        with patch.object(profiles, "KEY_SEED", seed), patch.object(profiles, "RUNTIME_HOME", self.home):
            env = profiles.env_values(profiles.profile_dir(self.ids[0]) / ".env")
        self.assertEqual(env["ANTHROPIC_API_KEY"], "sk-ant-api03-x")

    def test_missing_setup_changes_nothing(self):
        (self.backend / ".env.hermes").unlink()
        with self.assertRaises(SystemExit):
            self.run_script("--apply")
        self.assertFalse((self.home / "profiles").exists())

    def test_missing_database_url_is_a_clear_error(self):
        with patch.dict("os.environ", {"MULA_DATABASE_URL": ""}):
            with self.assertRaises(SystemExit) as failure:
                self.run_script()
        self.assertIn("MULA_DATABASE_URL is missing", str(failure.exception))
