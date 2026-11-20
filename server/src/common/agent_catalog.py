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
import hashlib
import re
from pathlib import Path

import yaml

AGENTS_DIR = Path(__file__).resolve().parents[2] / "agents"
# At most 26 characters: an agent other than the Operator gets its own runtime profile named
# `mula-<32 hex>-<agent id>`, and the runtime allows profile names of up to 64 (common/profiles.py).
AGENT_ID = re.compile(r"^[a-z][a-z0-9_]{0,25}$")
CAPABILITY_ID = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
# The tools served by features/agents/tools.py. A test keeps this list in step with
# that server; it lives here so the catalog does not import the feature modules.
RUNTIME_TOOLS = frozenset({"ask_agent", "remember", "calculate_forecast", "latest_forecast"})
# Tools the same server offers only to the workspace assistant, never to a project agent: an agent
# file can't name them, and their tickets (orchestrator/proposals.py) name an account, not a project.
ASSISTANT_TOOLS = frozenset({"create_project"})
# The runtime's own toolsets an agent file may offer, each one switched on per agent in My agents.
# Only these are allowed: none of them runs commands, reads or writes files, or drives a browser or
# the desktop on the machine running Mula (terminal, file, code_execution, browser, computer_use,
# cronjob and skills stay out, as does delegation, which would bypass Mula's own A2A requests).
# Keep in step with SAFE_TOOL_NAMES in scripts/apply_hermes_profile.py.
SAFE_TOOLSETS = {
    "web": ("web_search", "web_extract"),
    "vision": ("vision_analyze",),
    "image_gen": ("image_generate",),
    "todo": ("todo_list",),
    "session_search": ("session_search",),
}
# How an agent may ask another one (features/a2a): wait for the owner's OK, go ahead, switched off,
# or not connected at all. An agent file sets each link's default; the owner changes it in My agents.
LINK_MODES = ("ask", "auto", "off", "none")
REQUIRED_KEYS = frozenset({"name", "description", "order", "capabilities", "runtime_tools", "runtime_toolsets", "delegates_to"})
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


def read_links(path, fields):
    """`delegates_to`: the agents this one may ever ask, each with its default link mode."""
    value = fields["delegates_to"]
    if not isinstance(value, dict):
        raise AgentDefinitionError(f"{path.name}: delegates_to must be 'agent: mode' lines (mode is one of {', '.join(LINK_MODES)}), or {{}} for none.")
    for other, mode in value.items():
        if not isinstance(other, str) or not AGENT_ID.match(other):
            raise AgentDefinitionError(f"{path.name}: delegates_to names {other!r}, which is not an agent id.")
        if mode not in LINK_MODES:
            raise AgentDefinitionError(f"{path.name}: the link to {other} must be one of {', '.join(LINK_MODES)}.")
    return dict(value)


def read_toolsets(path, fields):
    toolsets = require_id_list(path, fields, "runtime_toolsets")
    unknown = set(toolsets) - set(SAFE_TOOLSETS)
    if unknown:
        raise AgentDefinitionError(f"{path.name}: runtime_toolsets may only name {', '.join(sorted(SAFE_TOOLSETS))}; not {', '.join(sorted(unknown))}.")
    return toolsets


def read_agent(path):
    """One validated agent from its file. Cross-agent checks happen in load_catalog."""
    agent_id = path.stem
    if not AGENT_ID.match(agent_id):
        raise AgentDefinitionError(f"{path.name}: the file name is the agent id and must be lowercase letters, digits and _, at most 26 characters.")
    text = path.read_text(encoding="utf-8")
    header, persona = split_front_matter(path, text)
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
        "runtime_toolsets": read_toolsets(path, fields),
        "delegates_to": read_links(path, fields),
        # Kept exactly as written: it is the start of the agent's system prompt.
        "persona": persona,
        # The agent card's version (features/a2a): it changes whenever the file does.
        "version": hashlib.sha256(text.encode("utf-8")).hexdigest()[:12],
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
