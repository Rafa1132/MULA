"""The brains (language models) an owner can choose for the Operator.

Each brain maps to a Mula runtime gateway alias. The default brain is the
gateway's own model (`HERMES_MODEL`, local Qwen). Every other brain is a
`gateway.api_server.model_routes` entry that `scripts/enable_claude.py`
writes into the runtime profile, so the runtime model and provider listed
here are the single source for both the app and that script.
"""

from .config import HERMES_MODEL

DEFAULT_BRAIN = "qwen"

BRAINS = {
    "qwen": {
        "name": "Qwen (local)",
        "description": "Runs on this computer through Ollama. Private and free to use.",
        "location": "local",
        "alias": HERMES_MODEL,
    },
    "claude-haiku": {
        "name": "Claude Haiku 5.5",
        "description": "Fast, low-cost Claude for quick everyday answers.",
        "location": "cloud",
        "alias": "mula-claude-haiku",
        "runtime_model": "claude-haiku-5-5",
        "provider": "anthropic",
    },
    "claude-sonnet": {
        "name": "Claude Sonnet 5.5",
        "description": "Balanced Claude for planning, writing and analysis.",
        "location": "cloud",
        "alias": "mula-claude-sonnet",
        "runtime_model": "claude-sonnet-5-5",
        "provider": "anthropic",
    },
    "claude-opus": {
        "name": "Claude Opus 5.5",
        "description": "The most capable Claude for difficult problems. Highest cost.",
        "location": "cloud",
        "alias": "mula-claude-opus",
        "runtime_model": "claude-opus-5-5",
        "provider": "anthropic",
    },
}


def alias_for(brain_id: str | None) -> str:
    """Gateway alias for a saved brain; a missing choice means the default brain."""
    if brain_id is None:
        return BRAINS[DEFAULT_BRAIN]["alias"]
    return BRAINS[brain_id]["alias"]


def runtime_routes() -> dict[str, dict[str, str]]:
    """`model_routes` entries for every brain that is not the gateway default."""
    routes = {}
    for brain in BRAINS.values():
        if "runtime_model" in brain:
            routes[brain["alias"]] = {"model": brain["runtime_model"], "provider": brain["provider"]}
    return routes
