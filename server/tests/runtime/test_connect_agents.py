import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml

from scripts import connect_agents

TEMPLATE = Path(connect_agents.BACKEND) / "hermes" / "config.yaml"
CONFIG = """model:
  default: huihui_ai/qwen3-abliterated:latest
platform_toolsets:
  api_server: []
  cli: []
mcp_servers:
  owner-server:
    url: https://example.com/mcp
"""


class ConnectAgentsTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        self.profile = root / "profile"
        self.backend = root / "server"
        self.profile.mkdir()
        (self.backend / "hermes").mkdir(parents=True)
        (self.backend / "hermes" / "config.yaml").write_text(TEMPLATE.read_text(encoding="utf-8"), encoding="utf-8")
        (self.profile / ".env").write_text("API_SERVER_KEY=gateway-key\n", encoding="utf-8")
        (self.profile / "config.yaml").write_text(CONFIG, encoding="utf-8")
        (self.backend / ".env.hermes").write_text("HERMES_API_KEY=gateway-key\nMULA_TOOLS_KEY=old\n", encoding="utf-8")
        for name, value in (("RUNTIME_HOME", self.profile), ("BACKEND", self.backend)):
            patcher = patch.object(connect_agents, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def run_script(self, *arguments):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            connect_agents.main(list(arguments))
        return output.getvalue()

    def env(self, path):
        return dict(line.split("=", 1) for line in path.read_text(encoding="utf-8").splitlines())

    def test_connect_shares_a_new_key_and_copies_the_template_policy(self):
        output = self.run_script()
        backend, runtime = self.env(self.backend / ".env.hermes"), self.env(self.profile / ".env")
        self.assertEqual(backend["MULA_TOOLS_KEY"], runtime["MULA_TOOLS_KEY"])
        self.assertNotEqual(backend["MULA_TOOLS_KEY"], "old")
        self.assertEqual(backend["HERMES_API_KEY"], "gateway-key")
        self.assertNotIn(backend["MULA_TOOLS_KEY"], output)
        config = yaml.safe_load((self.profile / "config.yaml").read_text(encoding="utf-8"))
        template = yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))
        self.assertEqual(config["mcp_servers"]["mula"], template["mcp_servers"]["mula"])
        self.assertEqual(config["platform_toolsets"], {"api_server": ["mula"], "cli": ["no_mcp"]})
        self.assertEqual(config["tools"]["tool_search"], {"enabled": "off"})
        self.assertIn("owner-server", config["mcp_servers"])
        self.assertEqual((self.profile / "config.yaml").stat().st_mode & 0o777, 0o600)

    def test_disable_removes_the_server_and_both_keys(self):
        self.run_script()
        self.run_script("--disable")
        self.assertNotIn("MULA_TOOLS_KEY", self.env(self.backend / ".env.hermes"))
        self.assertNotIn("MULA_TOOLS_KEY", self.env(self.profile / ".env"))
        config = yaml.safe_load((self.profile / "config.yaml").read_text(encoding="utf-8"))
        self.assertNotIn("mula", config["mcp_servers"])
        self.assertEqual(config["platform_toolsets"], {"api_server": [], "cli": []})

    def test_missing_profile_changes_nothing(self):
        (self.backend / ".env.hermes").unlink()
        with self.assertRaises(SystemExit):
            self.run_script()
        self.assertEqual((self.profile / "config.yaml").read_text(encoding="utf-8"), CONFIG)


if __name__ == "__main__":
    unittest.main()
