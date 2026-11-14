"""The agent catalog: one Markdown file per agent in server/agents/.

Each file is YAML front matter between two `---` lines, followed by the agent's
persona (its base system prompt). The file name is the agent id. Adding an agent
is adding a file; editing a persona or a capability label is editing text, with
no code change. Owner-specific settings still live in the database
(`agent_settings`); these files are the defaults every account starts from.

The catalog is read once when this module is imported, so the backend refuses
to start with a broken file instead of failing on the first chat. Restart the
backend after editing a file.
"""
import re
from pathlib import Path

import yaml

AGENTS_DIR = Path(__file__).resolve().parents[2] / "agents"
AGENT_ID = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
CAPABILITY_ID = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
# The tools served by features/agents/tools.py. A test keeps this list in step with
# that server; it lives here so the catalog does not import the feature modules.
RUNTIME_TOOLS = frozenset({"ask_agent", "remember", "calculate_forecast", "latest_forecast"})
REQUIRED_KEYS = frozenset({"name", "description", "order", "capabilities", "runtime_tools", "delegates_to"})
# The settings form accepts at most this many enabled tools (team.SettingsInput).
MAX_CAPABILITIES = 10
FRONT_MATTER = "---\n"


class AgentDefinitionError(Exception):
    """An agent file that cannot be used; the message names the file and the problem."""


def split_front_matter(path, text):
    """Return (front matter text, persona) from a file's contents."""
    if not text.startswith(FRONT_MATTER):
        raise AgentDefinitionError(f"{path.name}: must start with a '---' line opening the front matter.")
    end = text.find("\n" + FRONT_MATTER, len(FRONT_MATTER) - 1)
    if end == -1:
        raise AgentDefinitionError(f"{path.name}: the front matter has no closing '---' line.")
    header = text[len(FRONT_MATTER):end + 1]
    persona = text[end + 1 + len(FRONT_MATTER):]
    return header, persona


def parse_header(path, header):
    try:
        fields = yaml.safe_load(header)
    except yaml.YAMLError as error:
        raise AgentDefinitionError(f"{path.name}: the front matter is not valid YAML ({error}).") from error
    if not isinstance(fields, dict):
        raise AgentDefinitionError(f"{path.name}: the front matter must be a set of 'key: value' lines.")
    missing = REQUIRED_KEYS - set(fields)
    if missing:
        raise AgentDefinitionError(f"{path.name}: missing {', '.join(sorted(missing))}.")
    # Unknown keys are refused so a misspelt key cannot be silently ignored.
    unknown = set(fields) - REQUIRED_KEYS
    if unknown:
        raise AgentDefinitionError(f"{path.name}: unknown {', '.join(sorted(unknown))}.")
    return fields


def require_text(path, fields, key):
    value = fields[key]
    if not isinstance(value, str) or not value.strip():
        raise AgentDefinitionError(f"{path.name}: {key} must be non-empty text.")
    return value.strip()


def require_id_list(path, fields, key):
    value = fields[key]
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise AgentDefinitionError(f"{path.name}: {key} must be a list of names, such as [a, b] or [].")
    if len(value) != len(set(value)):
        raise AgentDefinitionError(f"{path.name}: {key} lists a name twice.")
    return list(value)


def read_capabilities(path, fields):
    value = fields["capabilities"]
    if not isinstance(value, dict):
        raise AgentDefinitionError(f"{path.name}: capabilities must be 'id: label' lines, or {{}} for none.")
    if len(value) > MAX_CAPABILITIES:
        raise AgentDefinitionError(f"{path.name}: at most {MAX_CAPABILITIES} capabilities are allowed.")
    for capability, label in value.items():
        if not isinstance(capability, str) or not CAPABILITY_ID.match(capability):
            raise AgentDefinitionError(f"{path.name}: capability id {capability!r} must be lowercase letters, digits and _.")
        if not isinstance(label, str) or not label.strip():
            raise AgentDefinitionError(f"{path.name}: capability {capability} needs a label.")
    return {capability: label.strip() for capability, label in value.items()}


def read_agent(path):
    """One validated agent from its file. Cross-agent checks happen in load_catalog."""
    agent_id = path.stem
    if not AGENT_ID.match(agent_id):
        raise AgentDefinitionError(f"{path.name}: the file name is the agent id and must be lowercase letters, digits and _.")
    header, persona = split_front_matter(path, path.read_text(encoding="utf-8"))
    fields = parse_header(path, header)
    order = fields["order"]
    # bool is an int in Python; `order: yes` is a mistake, not position 1.
    if not isinstance(order, int) or isinstance(order, bool):
        raise AgentDefinitionError(f"{path.name}: order must be a whole number.")
    runtime_tools = require_id_list(path, fields, "runtime_tools")
    unknown_tools = set(runtime_tools) - RUNTIME_TOOLS
    if unknown_tools:
        raise AgentDefinitionError(f"{path.name}: unknown runtime tool {', '.join(sorted(unknown_tools))}. Known: {', '.join(sorted(RUNTIME_TOOLS))}.")
    if not persona.strip():
        raise AgentDefinitionError(f"{path.name}: the persona below the front matter is empty.")
    return {
        "id": agent_id,
        "name": require_text(path, fields, "name"),
        "description": require_text(path, fields, "description"),
        "order": order,
        "capabilities": read_capabilities(path, fields),
        "runtime_tools": frozenset(runtime_tools),
        "delegates_to": require_id_list(path, fields, "delegates_to"),
        # Kept exactly as written: it is the start of the agent's system prompt.
        "persona": persona,
    }


def load_catalog(folder=AGENTS_DIR):
    """Every agent in `folder`, keyed by id, sorted by `order` then id."""
    folder = Path(folder)
    if not folder.is_dir():
        raise AgentDefinitionError(f"The agent folder {folder} does not exist.")
    # README.md documents the folder; it is not an agent definition.
    agents = [read_agent(path) for path in sorted(folder.glob("*.md")) if path.name != "README.md"]
    if not agents:
        raise AgentDefinitionError(f"The agent folder {folder} has no agent files (*.md).")
    catalog = {agent["id"]: agent for agent in sorted(agents, key=lambda agent: (agent["order"], agent["id"]))}
    for agent in catalog.values():
        for other in agent["delegates_to"]:
            if other == agent["id"]:
                raise AgentDefinitionError(f"{agent['id']}.md: an agent cannot delegate to itself.")
            if other not in catalog:
                raise AgentDefinitionError(f"{agent['id']}.md: delegates_to names {other!r}, which has no file in {folder.name}/.")
        if agent["delegates_to"] and "ask_agent" not in agent["runtime_tools"]:
            raise AgentDefinitionError(f"{agent['id']}.md: delegates_to needs ask_agent in runtime_tools.")
    return catalog


CATALOG = load_catalog()
