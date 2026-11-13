import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml

from scripts import enable_claude
from src.common.brains import runtime_routes

API_KEY = "sk-ant-api03-test-only-key"
GATEWAY_ENV = "API_SERVER_ENABLED=true\nAPI_SERVER_KEY=gateway-key\n"
CONFIG = """model:
  default: huihui_ai/qwen3-abliterated:latest
gateway:
  api_server:
    port: 8642
    model_name: hermes-agent
    model_routes:
      owner-route:
        model: other-model
"""


class EnableClaudeTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.profile = Path(directory.name)
        (self.profile / ".env").write_text(GATEWAY_ENV, encoding="utf-8")
        (self.profile / "config.yaml").write_text(CONFIG, encoding="utf-8")
        home = patch.object(enable_claude, "RUNTIME_HOME", self.profile)
        home.start()
        self.addCleanup(home.stop)

    def run_script(self, *arguments, key=API_KEY):
        output = io.StringIO()
        with patch.object(enable_claude.getpass, "getpass", return_value=key), contextlib.redirect_stdout(output):
            enable_claude.main(list(arguments))
        return output.getvalue()

    def files(self):
        env = (self.profile / ".env").read_text(encoding="utf-8")
        config = yaml.safe_load((self.profile / "config.yaml").read_text(encoding="utf-8"))
        return env, config

    def test_enable_stores_key_privately_and_adds_routes(self):
        output = self.run_script()
        env, config = self.files()
        self.assertIn(f"ANTHROPIC_API_KEY={API_KEY}", env.splitlines())
        self.assertIn("API_SERVER_KEY=gateway-key", env.splitlines())
        self.assertNotIn(API_KEY, output)
        routes = config["gateway"]["api_server"]["model_routes"]
        self.assertEqual(routes["owner-route"], {"model": "other-model"})
        for alias, route in runtime_routes().items():
            self.assertEqual(routes[alias], route)
        self.assertEqual(config["gateway"]["api_server"]["port"], 8642)
        self.assertEqual(config["model"]["default"], "huihui_ai/qwen3-abliterated:latest")
        for name in (".env", "config.yaml"):
            self.assertEqual((self.profile / name).stat().st_mode & 0o777, 0o600)

    def test_rerun_replaces_the_key_and_disable_removes_only_claude(self):
        self.run_script()
        self.run_script(key="sk-ant-api03-second-key")
        env, _ = self.files()
        self.assertEqual([line for line in env.splitlines() if line.startswith("ANTHROPIC_API_KEY=")],
                         ["ANTHROPIC_API_KEY=sk-ant-api03-second-key"])
        self.run_script("--disable")
        env, config = self.files()
        self.assertNotIn("ANTHROPIC_API_KEY", env)
        self.assertIn("API_SERVER_KEY=gateway-key", env.splitlines())
        self.assertEqual(config["gateway"]["api_server"]["model_routes"], {"owner-route": {"model": "other-model"}})

    def test_subscription_tokens_and_invalid_keys_change_nothing(self):
        before = self.files()
        for key in ("sk-ant-oat01-subscription", "eyJhbGciOi", "not-a-key", "sk-ant-api03 with space", ""):
            with self.subTest(key=key[:12]), self.assertRaises(SystemExit):
                self.run_script(key=key)
            self.assertEqual(self.files(), before)

    def test_profile_with_subscription_token_is_refused(self):
        (self.profile / ".env").write_text(GATEWAY_ENV + "export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-x\n", encoding="utf-8")
        before = self.files()
        with self.assertRaises(SystemExit):
            self.run_script()
        self.assertEqual(self.files(), before)

    def test_unexpected_config_layout_changes_nothing(self):
        (self.profile / "config.yaml").write_text("gateway: disabled\n", encoding="utf-8")
        before = self.files()
        with self.assertRaises(SystemExit):
            self.run_script()
        self.assertEqual(self.files(), before)


if __name__ == "__main__":
    unittest.main()
