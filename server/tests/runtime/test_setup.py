import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import setup_hermes


class SetupTests(unittest.TestCase):
    def test_private_matching_credentials_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = Path(directory) / "server"
            profile = Path(directory) / "profile"
            template = backend / "hermes" / "config.yaml"
            template.parent.mkdir(parents=True)
            template.write_text("platform_toolsets:\n  api_server: []\n", encoding="utf-8")
            output = io.StringIO()
            with patch.object(setup_hermes, "BACKEND", backend), patch.object(
                setup_hermes, "RUNTIME_HOME", profile
            ), patch.object(setup_hermes, "POSTGRES_ENV", Path(directory) / ".env.postgres"), patch.object(
                setup_hermes, "native_postgres_available", lambda: True
            ), contextlib.redirect_stdout(output):
                setup_hermes.main()
                backend_file = backend / ".env.hermes"
                gateway_file = profile / ".env"
                before = backend_file.read_text(encoding="utf-8")
                settings = dict(line.split("=", 1) for line in before.splitlines())
                gateway_settings = dict(
                    line.split("=", 1)
                    for line in gateway_file.read_text(encoding="utf-8").splitlines()
                )
                key = settings["HERMES_API_KEY"]
                self.assertGreaterEqual(len(key), 32)
                self.assertEqual(key, gateway_settings["API_SERVER_KEY"])
                self.assertNotIn(key, output.getvalue())
                # The runtime's key for calling the backend's agent tools is shared and separate.
                tools_key = settings["MULA_TOOLS_KEY"]
                self.assertGreaterEqual(len(tools_key), 32)
                self.assertEqual(tools_key, gateway_settings["MULA_TOOLS_KEY"])
                self.assertNotEqual(tools_key, key)
                # The seed for each account's profile key stays on the backend only.
                seed = settings["MULA_PROFILE_KEY_SEED"]
                self.assertGreaterEqual(len(seed), 32)
                self.assertNotIn("MULA_PROFILE_KEY_SEED", gateway_settings)
                self.assertNotIn(seed, output.getvalue())
                self.assertNotIn(tools_key, output.getvalue())
                self.assertEqual(backend_file.stat().st_mode & 0o777, 0o600)
                self.assertEqual(gateway_file.stat().st_mode & 0o777, 0o600)
                # A native PostgreSQL is used directly: local URL, no password, no compose file.
                self.assertEqual(settings["MULA_DATABASE_URL"], "postgresql://localhost/mula")
                self.assertNotIn("MULA_DATABASE_URL", gateway_settings)
                self.assertFalse((Path(directory) / ".env.postgres").exists())
                with self.assertRaises(SystemExit):
                    setup_hermes.main()
                self.assertEqual(backend_file.read_text(encoding="utf-8"), before)

    def test_without_native_postgres_compose_gets_a_random_password(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = Path(directory) / "server"
            profile = Path(directory) / "profile"
            compose_env = Path(directory) / ".env.postgres"
            template = backend / "hermes" / "config.yaml"
            template.parent.mkdir(parents=True)
            template.write_text("platform_toolsets:\n  api_server: []\n", encoding="utf-8")
            output = io.StringIO()
            with patch.object(setup_hermes, "BACKEND", backend), patch.object(
                setup_hermes, "RUNTIME_HOME", profile
            ), patch.object(setup_hermes, "POSTGRES_ENV", compose_env), patch.object(
                setup_hermes, "native_postgres_available", lambda: False
            ), contextlib.redirect_stdout(output):
                setup_hermes.main()
            settings = dict(line.split("=", 1) for line in (backend / ".env.hermes").read_text(encoding="utf-8").splitlines())
            compose = dict(line.split("=", 1) for line in compose_env.read_text(encoding="utf-8").splitlines())
            password = compose["POSTGRES_PASSWORD"]
            self.assertGreaterEqual(len(password), 24)
            self.assertEqual(settings["MULA_DATABASE_URL"], f"postgresql://mula:{password}@127.0.0.1:5432/mula")
            self.assertEqual(compose_env.stat().st_mode & 0o777, 0o600)
            self.assertNotIn(password, output.getvalue())

    def test_existing_partial_setup_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = Path(directory) / "server"
            profile = Path(directory) / "profile"
            profile.mkdir()
            config = profile / "config.yaml"
            config.write_text("existing configuration", encoding="utf-8")
            with patch.object(setup_hermes, "BACKEND", backend), patch.object(
                setup_hermes, "RUNTIME_HOME", profile
            ), self.assertRaises(SystemExit):
                setup_hermes.main()
            self.assertEqual(config.read_text(encoding="utf-8"), "existing configuration")
            self.assertFalse((backend / ".env.hermes").exists())


if __name__ == "__main__":
    unittest.main()
