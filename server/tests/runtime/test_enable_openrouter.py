import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml

from scripts import enable_openrouter
from src.common.brains import BRAINS, runtime_routes

API_KEY = "sk-or-v1-test-only-key"
GATEWAY_ENV = "API_SERVER_ENABLED=true\nAPI_SERVER_KEY=gateway-key\nANTHROPIC_API_KEY=sk-ant-api03-existing\n"
CONFIG = """model:
  default: huihui_ai/qwen3-abliterated:latest
gateway:
  api_server:
    port: 8642
    model_name: hermes-agent
    model_routes:
      owner-route:
        model: other-model
      mula-claude-haiku:
        model: claude-haiku-5-5
        provider: anthropic
"""
TEMPLATES = Path(__file__).resolve().parents[2] / "hermes"


class EnableOpenRouterTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.profile = Path(directory.name)
        (self.profile / ".env").write_text(GATEWAY_ENV, encoding="utf-8")
        (self.profile / "config.yaml").write_text(CONFIG, encoding="utf-8")
        home = patch.object(enable_openrouter, "RUNTIME_HOME", self.profile)
        home.start()
        self.addCleanup(home.stop)

    def run_script(self, *arguments, key=API_KEY):
        output = io.StringIO()
        with patch("getpass.getpass", return_value=key), contextlib.redirect_stdout(output):
            enable_openrouter.main(list(arguments))
        return output.getvalue()

    def files(self):
        env = (self.profile / ".env").read_text(encoding="utf-8")
        config = yaml.safe_load((self.profile / "config.yaml").read_text(encoding="utf-8"))
        return env, config

    def test_enable_stores_key_privately_and_adds_only_openrouter_routes(self):
        output = self.run_script()
        env, config = self.files()
        self.assertIn(f"OPENROUTER_API_KEY={API_KEY}", env.splitlines())
        self.assertIn("ANTHROPIC_API_KEY=sk-ant-api03-existing", env.splitlines())
        self.assertNotIn(API_KEY, output)
        routes = config["gateway"]["api_server"]["model_routes"]
        self.assertEqual(routes["mula-qwen-openrouter"], {"model": "qwen/qwen3.8-27b", "provider": "openrouter"})
        # The owner's route and the Claude route stay as they were; no other Claude brain is added.
        self.assertEqual(routes["owner-route"], {"model": "other-model"})
        self.assertEqual(routes["mula-claude-haiku"], {"model": "claude-haiku-5-5", "provider": "anthropic"})
        self.assertNotIn("mula-claude-opus", routes)
        for name in (".env", "config.yaml"):
            self.assertEqual((self.profile / name).stat().st_mode & 0o777, 0o600)

    def test_rerun_replaces_the_key_and_disable_removes_only_openrouter(self):
        self.run_script()
        self.run_script(key="sk-or-v1-second-key")
        env, _ = self.files()
        self.assertEqual([line for line in env.splitlines() if line.startswith("OPENROUTER_API_KEY=")],
                         ["OPENROUTER_API_KEY=sk-or-v1-second-key"])
        self.run_script("--disable")
        env, config = self.files()
        self.assertNotIn("OPENROUTER_API_KEY", env)
        self.assertIn("ANTHROPIC_API_KEY=sk-ant-api03-existing", env.splitlines())
        self.assertEqual(set(config["gateway"]["api_server"]["model_routes"]), {"owner-route", "mula-claude-haiku"})

    def test_invalid_keys_change_nothing(self):
        before = self.files()
        for key in ("sk-ant-api03-claude-key", "not-a-key", "sk-or-v1 with space", ""):
            with self.subTest(key=key[:12]), self.assertRaises(SystemExit):
                self.run_script(key=key)
            self.assertEqual(self.files(), before)

    def test_templates_pin_each_openrouter_brain_to_its_host(self):
        self.assertTrue(runtime_routes("openrouter"))
        for template in ("config.yaml", "profile.config.yaml"):
            pins = yaml.safe_load((TEMPLATES / template).read_text(encoding="utf-8"))["provider_routing"]["models"]
            for brain in BRAINS.values():
                if brain.get("provider") == "openrouter":
                    with self.subTest(template=template, model=brain["runtime_model"]):
                        self.assertEqual(pins[brain["runtime_model"]], {"only": brain["openrouter_only"]})


if __name__ == "__main__":
    unittest.main()
