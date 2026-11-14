import contextlib
import io
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import yaml

from scripts import provision_profiles
from src.common import profiles

CONFIG = "model:\n  default: huihui_ai/qwen3-abliterated:latest\ngateway:\n  api_server:\n    port: 8642\n"


class ProvisionProfilesTests(unittest.TestCase):
    def setUp(self):
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
        self.database = root / "accounts.sqlite3"
        self.ids = [str(uuid4()), str(uuid4())]
        with sqlite3.connect(self.database) as db:
            db.execute("CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT)")
            db.executemany("INSERT INTO accounts VALUES (?, ?)", [(account_id, account_id[:4]) for account_id in self.ids])
        for module, name, value in ((provision_profiles, "BACKEND", self.backend), (provision_profiles, "RUNTIME_HOME", self.home)):
            patcher = patch.object(module, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        env = patch.dict("os.environ", {"LARAS_ACCOUNT_DB": str(self.database)})
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
