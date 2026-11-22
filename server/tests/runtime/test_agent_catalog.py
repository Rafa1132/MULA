"""The agent folder (server/agents/*.md) and its loader, common/agent_catalog.py."""
import asyncio
import tempfile
import unittest
from pathlib import Path

from src.common import agent_catalog
from src.common.agent_catalog import AgentDefinitionError, load_catalog

HEADER = {
    "name": "Helper",
    "description": "Helps.",
    "order": "1",
    "capabilities": "{}",
    "runtime_tools": "[]",
    "runtime_toolsets": "[]",
    "delegates_to": "{}",
}


def agent_file(overrides=None, drop=(), persona="You are a helper.\n"):
    """The text of an agent file built from HEADER, with some keys changed or left out."""
    fields = dict(HEADER)
    fields.update(overrides or {})
    lines = [f"{key}: {value}" for key, value in fields.items() if key not in drop]
    return "---\n" + "\n".join(lines) + "\n---\n" + persona


class AgentFolderTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)

    def write(self, name, text):
        (self.folder / name).write_text(text, encoding="utf-8")

    def assertRefused(self, fragment):
        with self.assertRaises(AgentDefinitionError) as caught:
            load_catalog(self.folder)
        self.assertIn(fragment, str(caught.exception))

    def test_loads_fields_and_keeps_the_persona_exactly(self):
        persona = "Line one.\n\n  Indented line, kept.\n"
        self.write("helper.md", agent_file({"capabilities": "{read: Read files}", "runtime_tools": "[remember]"}, persona=persona))
        agent = load_catalog(self.folder)["helper"]
        self.assertEqual(agent["name"], "Helper")
        self.assertEqual(agent["capabilities"], {"read": "Read files"})
        self.assertEqual(agent["runtime_tools"], frozenset({"remember"}))
        self.assertEqual(agent["persona"], persona)

    def test_orders_by_order_then_id(self):
        self.write("zeta.md", agent_file({"order": "1"}))
        self.write("alpha.md", agent_file({"order": "2"}))
        self.write("beta.md", agent_file({"order": "2"}))
        self.assertEqual(list(load_catalog(self.folder)), ["zeta", "alpha", "beta"])

    def test_delegation_must_name_a_known_agent_and_use_ask_agent(self):
        self.write("helper.md", agent_file({"runtime_tools": "[ask_agent]", "delegates_to": "{missing: ask}"}))
        self.assertRefused("'missing', which has no file")
        self.write("helper.md", agent_file({"delegates_to": "{other: ask}"}))
        self.write("other.md", agent_file())
        self.assertRefused("needs ask_agent")
        self.write("helper.md", agent_file({"runtime_tools": "[ask_agent]", "delegates_to": "{helper: ask}"}))
        self.assertRefused("cannot delegate to itself")

    def test_links_name_a_default_mode(self):
        self.write("other.md", agent_file())
        self.write("helper.md", agent_file({"runtime_tools": "[ask_agent]", "delegates_to": "{other: none}"}))
        self.assertEqual(load_catalog(self.folder)["helper"]["delegates_to"], {"other": "none"})
        for links, fragment in (("[other]", "must be 'agent: mode' lines"), ("{other: maybe}", "must be one of ask, auto, off, none")):
            with self.subTest(links=links):
                self.write("helper.md", agent_file({"runtime_tools": "[ask_agent]", "delegates_to": links}))
                self.assertRefused(fragment)

    def test_only_safe_runtime_toolsets_can_be_offered(self):
        self.write("helper.md", agent_file({"runtime_toolsets": "[todo, web]"}))
        self.assertEqual(load_catalog(self.folder)["helper"]["runtime_toolsets"], ["todo", "web"])
        for unsafe in ("terminal", "file", "code_execution", "browser", "computer_use", "cronjob", "skills", "delegation"):
            with self.subTest(toolset=unsafe):
                self.write("helper.md", agent_file({"runtime_toolsets": f"[{unsafe}]"}))
                self.assertRefused(f"not {unsafe}")

    def test_agent_ids_fit_a_runtime_profile_name(self):
        self.write("a" + "b" * 26 + ".md", agent_file())
        self.assertRefused("at most 26 characters")

    def test_version_changes_with_the_file(self):
        self.write("helper.md", agent_file())
        first = load_catalog(self.folder)["helper"]["version"]
        self.write("helper.md", agent_file(persona="You are a different helper.\n"))
        self.assertNotEqual(first, load_catalog(self.folder)["helper"]["version"])

    def test_refuses_broken_files_with_the_file_name(self):
        cases = [
            ("no front matter", "You are a helper.\n", "must start with"),
            ("unclosed", "---\nname: Helper\n", "no closing"),
            ("bad yaml", "---\nname: [unclosed\n---\nHi\n", "not valid YAML"),
            ("missing key", agent_file(drop=("description",)), "missing description"),
            ("misspelt key", agent_file({"delegate_to": "{}"}), "unknown delegate_to"),
            ("empty name", agent_file({"name": "''"}), "name must be non-empty"),
            ("boolean order", agent_file({"order": "yes"}), "order must be a whole number"),
            ("unknown tool", agent_file({"runtime_tools": "[shell]"}), "unknown runtime tool shell"),
            ("tool listed twice", agent_file({"runtime_tools": "[remember, remember]"}), "lists a name twice"),
            ("unlabelled capability", agent_file({"capabilities": "{read: ''}"}), "needs a label"),
            ("bad capability id", agent_file({"capabilities": "{Read-All: Read}"}), "capability id"),
            ("empty persona", agent_file(persona="\n  \n"), "persona below the front matter is empty"),
        ]
        for label, text, fragment in cases:
            with self.subTest(label):
                self.write("helper.md", text)
                self.assertRefused("helper.md")
                self.assertRefused(fragment)

    def test_refuses_too_many_capabilities(self):
        many = "{" + ", ".join(f"c{number}: Label" for number in range(agent_catalog.MAX_CAPABILITIES + 1)) + "}"
        self.write("helper.md", agent_file({"capabilities": many}))
        self.assertRefused("at most")

    def test_template_key_is_optional_and_boolean(self):
        self.write("helper.md", agent_file({"template": "true"}))
        self.assertTrue(load_catalog(self.folder)["helper"]["template"])
        self.write("helper.md", agent_file())
        self.assertFalse(load_catalog(self.folder)["helper"]["template"])
        self.write("helper.md", agent_file({"template": "'yes'"}))
        self.assertRefused("template must be true or false")

    def test_no_agent_may_depend_on_a_template(self):
        self.write("other.md", agent_file({"template": "true"}))
        self.write("helper.md", agent_file({"runtime_tools": "[ask_agent]", "delegates_to": "{other: ask}"}))
        self.assertRefused("a template agent a project may not have")

    def test_file_name_is_the_agent_id(self):
        self.write("Bad Name.md", agent_file())
        self.assertRefused("file name is the agent id")

    def test_empty_or_missing_folder_is_refused(self):
        self.assertRefused("no agent files")
        with self.assertRaises(AgentDefinitionError):
            load_catalog(self.folder / "absent")


class ShippedAgentsTests(unittest.TestCase):
    """The files in server/agents/ that the backend actually loads."""

    def test_shipped_agents_load_in_display_order(self):
        catalog = load_catalog()
        self.assertEqual(list(catalog), ["operator", "forecasting", "customer_service"])
        self.assertEqual(catalog["operator"]["delegates_to"], {"forecasting": "ask"})
        # Forecasting may ask the Operator, but is not connected until the owner connects it.
        self.assertEqual(catalog["forecasting"]["delegates_to"], {"operator": "none"})
        self.assertEqual(catalog["operator"]["runtime_tools"], frozenset({"ask_agent", "remember", "board_list", "board_add_card", "board_comment"}))
        # Forecasting reads and comments on the Board but doesn't add cards.
        self.assertEqual(catalog["forecasting"]["runtime_tools"], frozenset({"ask_agent", "calculate_forecast", "latest_forecast", "board_list", "board_comment"}))
        for agent_id in ("operator", "forecasting"):
            self.assertEqual(set(catalog[agent_id]["runtime_toolsets"]), set(agent_catalog.SAFE_TOOLSETS))
        # Customer Service is a template a project adds, answers only from the knowledge base (no web
        # or other runtime toolsets), and has no tool that moves money, changes orders or shares files.
        service = catalog["customer_service"]
        self.assertTrue(service["template"])
        self.assertFalse(catalog["operator"]["template"] or catalog["forecasting"]["template"])
        self.assertEqual(service["runtime_toolsets"], [])
        self.assertEqual(service["runtime_tools"], frozenset({"knowledge_search", "handoff_create"}))
        self.assertEqual(set(service["capabilities"]), {"knowledge_read", "handoff"})
        self.assertEqual(service["delegates_to"], {})
        self.assertTrue(catalog["operator"]["persona"].startswith("You are the Operator AI"))

    def test_known_runtime_tools_match_the_tool_server(self):
        from src.features.agents.tools import server
        served = {tool.name for tool in asyncio.run(server.list_tools())}
        self.assertEqual(served, set(agent_catalog.RUNTIME_TOOLS | agent_catalog.ASSISTANT_TOOLS))
        self.assertFalse(agent_catalog.RUNTIME_TOOLS & agent_catalog.ASSISTANT_TOOLS)

    def test_the_runtime_templates_offer_every_served_tool(self):
        # The runtime only offers the tools on its include list, so a tool missing there is never seen.
        import yaml
        for name in ("config.yaml", "profile.config.yaml"):
            template = yaml.safe_load((Path(__file__).resolve().parents[2] / "hermes" / name).read_text())
            include = set(template["mcp_servers"]["mula"]["tools"]["include"])
            self.assertEqual(include, set(agent_catalog.RUNTIME_TOOLS | agent_catalog.ASSISTANT_TOOLS), name)

    def test_safe_tool_names_match_the_runtime_patch(self):
        from scripts.apply_hermes_profile import SAFE_TOOL_NAMES
        names = {name for tools in agent_catalog.SAFE_TOOLSETS.values() for name in tools}
        self.assertEqual(names, set(SAFE_TOOL_NAMES))

    def test_team_api_shape_hides_persona_and_runtime_tools(self):
        from src.features.team import service as team
        self.assertEqual(set(team.AGENTS["operator"]), {"name", "description", "tools", "delegates_to", "available_toolsets", "template"})
        self.assertEqual(list(team.AGENTS["operator"]["tools"]), ["csv_read", "memory_read", "memory_write"])


if __name__ == "__main__":
    unittest.main()
