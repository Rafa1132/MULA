"""Behavior checks for the scoped context exception, including tool protection."""
import ast
import logging
import subprocess
from types import ModuleType, SimpleNamespace
from typing import Any, Optional
import unittest
from unittest.mock import patch

from scripts.apply_hermes_profile import ANCHOR, LOOP_ANCHOR, LOOP_REPLACEMENT, PREVIOUS_REPLACEMENT, REPLACEMENT, SOURCE


def tool(name):
    return {"type": "function", "function": {"name": name}}


def functions(source, names, namespace, modules):
    """Compile only the named top-level functions of `source` into `namespace`."""
    tree = ast.parse(source)
    body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    with patch.dict("sys.modules", modules):
        exec(compile(ast.Module(body=body, type_ignores=[]), "patched.py", "exec"), namespace)
    return namespace


class ContextProfileTests(unittest.TestCase):
    def setUp(self):
        if not (SOURCE / ".git").exists():
            self.skipTest("Pinned Hermes source is not installed")

    def pristine(self, relative):
        # Test the patch this script applies, not whatever is currently on disk.
        return subprocess.check_output(["git", "-C", str(SOURCE), "show", f"HEAD:{relative}"], text=True)

    def modules(self, config):
        config_module = ModuleType("hermes_cli.config")
        config_module.load_config = lambda: config
        return {"hermes_cli": ModuleType("hermes_cli"), "hermes_cli.config": config_module}

    def guard(self, replacement, config):
        modules = self.modules(config)
        source = self.pristine("agent/agent_init.py").replace(ANCHOR, replacement, 1)
        namespace = functions(source, {"_mula_compact_agent", "_enforce_minimum_context"}, {"MINIMUM_CONTEXT_LENGTH": 64000}, modules)

        def run(agent):
            with patch.dict("sys.modules", modules):
                namespace["_enforce_minimum_context"](agent)
        return run, namespace

    def agent(self, **changes):
        values = dict(
            platform="api_server", model="huihui_ai/qwen3-abliterated:latest",
            tools=[tool("mcp__mula__ask_agent"), tool("mcp__mula__calculate_forecast"), tool("mcp__mula__latest_forecast")],
            context_compressor=SimpleNamespace(context_length=40960),
            _ollama_num_ctx=40960, base_url="", provider="custom", _config_context_length=40960,
        )
        values.update(changes)
        return SimpleNamespace(**values)

    REFUSED = {
        "terminal tool": {"tools": [tool("mcp__mula__ask_agent"), tool("terminal")]},
        "other MCP server": {"tools": [tool("mcp__github__create_issue")]},
        "too many tools": {"tools": [tool(f"mcp__mula__tool_{index}") for index in range(6)]},
        "malformed tool": {"tools": [{"function": {}}]},
        "other platform": {"platform": "cli"},
        "other model": {"model": "different-model"},
    }

    def test_only_mula_tools_on_the_configured_profile_can_use_smaller_context(self):
        guard, _ = self.guard(REPLACEMENT, {"agent": {"mula_compact_operator": True}})
        guard(self.agent())
        guard(self.agent(tools=[]))
        for case, changes in self.REFUSED.items():
            with self.subTest(case=case), self.assertRaises(ValueError):
                guard(self.agent(**changes))

    def test_profile_flag_is_required(self):
        guard, _ = self.guard(REPLACEMENT, {"agent": {}})
        with self.assertRaises(ValueError):
            guard(self.agent(tools=[]))

    def test_request_time_check_uses_the_same_exception(self):
        config = {"agent": {"mula_compact_operator": True}}
        _, agent_init = self.guard(REPLACEMENT, config)
        agent_module = ModuleType("agent.agent_init")
        agent_module._mula_compact_agent = agent_init["_mula_compact_agent"]
        modules = {**self.modules(config), "agent": ModuleType("agent"), "agent.agent_init": agent_module}
        source = self.pristine("agent/conversation_loop.py").replace(LOOP_ANCHOR, LOOP_REPLACEMENT, 1)
        namespace = functions(source, {"_ollama_context_limit_error"}, {
            "Any": Any, "Optional": Optional, "MINIMUM_CONTEXT_LENGTH": 64000, "logger": logging.getLogger("test")}, modules)
        check = namespace["_ollama_context_limit_error"]
        with patch.dict("sys.modules", modules):
            self.assertIsNone(check(self.agent(), 1000))
            for case, changes in self.REFUSED.items():
                with self.subTest(case=case):
                    self.assertIn("for reliable tool use", check(self.agent(**changes), 1000))

    def test_previous_tool_free_patch_still_refuses_tools(self):
        # The script upgrades this version in place; it must never have allowed tools.
        guard, _ = self.guard(PREVIOUS_REPLACEMENT, {"agent": {"mula_compact_operator": True}})
        guard(self.agent(tools=[]))
        with self.assertRaises(ValueError):
            guard(self.agent())


if __name__ == "__main__":
    unittest.main()
