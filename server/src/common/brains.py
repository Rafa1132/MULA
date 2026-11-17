"""The brains (language models) an owner can choose for the Operator.

Each brain maps to a Mula runtime gateway alias. The default brain is the
gateway's own model (`HERMES_MODEL`, local Qwen). Every other brain is a
`gateway.api_server.model_routes` entry that its provider's script writes into
the runtime profile (`scripts/enable_claude.py` for Anthropic,
`scripts/enable_openrouter.py` for OpenRouter), so the runtime model and
provider listed here are the single source for both the app and those scripts.
"""

from .config import HERMES_MODEL

DEFAULT_BRAIN = "qwen"
# `host` names who receives an agent's messages; the brain picker shows it next to each brain.
# Cloud brains also name the script that sets them up (`setup_script`) and the key it asks for
# (`setup_key`), so the picker's setup help matches the provider instead of assuming Claude.

BRAINS = {
    "qwen": {
        "name": "Qwen (local)",
        "description": "Runs on this computer through Ollama. Private and free to use.",
        "location": "local",
        "host": "this computer",
        "alias": HERMES_MODEL,
    },
    "claude-haiku": {
        "name": "Claude Haiku 5.5",
        "description": "Fast, low-cost Claude for quick everyday answers.",
        "location": "cloud",
        "alias": "mula-claude-haiku",
        "host": "Anthropic",
        "setup_script": "enable_claude.py",
        "setup_key": "a Claude Console API key",
        "runtime_model": "claude-haiku-5-5",
        "provider": "anthropic",
    },
    "claude-sonnet": {
        "name": "Claude Sonnet 5.5",
        "description": "Balanced Claude for planning, writing and analysis.",
        "location": "cloud",
        "alias": "mula-claude-sonnet",
        "host": "Anthropic",
        "setup_script": "enable_claude.py",
        "setup_key": "a Claude Console API key",
        "runtime_model": "claude-sonnet-5-5",
        "provider": "anthropic",
    },
    "claude-opus": {
        "name": "Claude Opus 5.5",
        "description": "The most capable Claude for difficult problems. Highest cost.",
        "location": "cloud",
        "alias": "mula-claude-opus",
        "host": "Anthropic",
        "setup_script": "enable_claude.py",
        "setup_key": "a Claude Console API key",
        "runtime_model": "claude-opus-5-5",
        "provider": "anthropic",
    },
    "qwen-openrouter": {
        "name": "Qwen 3.8 27B",
        "description": "A larger Qwen in the cloud through OpenRouter, hosted by Chutes. Much faster than local; each message costs a little and leaves this computer.",
        "location": "cloud",
        "alias": "mula-qwen-openrouter",
        "host": "OpenRouter · Chutes",
        "setup_script": "enable_openrouter.py",
        "setup_key": "an OpenRouter API key",
        "runtime_model": "qwen/qwen3.8-27b",
        "provider": "openrouter",
        # OpenRouter may serve a model from many hosts. The runtime templates pin this one to
        # Chutes (`provider_routing.models` in hermes/*.yaml) so requests never move elsewhere.
        "openrouter_only": ["chutes"],
    },
}


def alias_for(brain_id: str | None) -> str:
    """Gateway alias for a saved brain; a missing choice means the default brain."""
    if brain_id is None:
        return BRAINS[DEFAULT_BRAIN]["alias"]
    return BRAINS[brain_id]["alias"]


def runtime_routes(provider: str | None = None) -> dict[str, dict[str, str]]:
    """`model_routes` entries for every brain that is not the gateway default, or only one provider's.

    Each provider is enabled by its own script with its own key, so each script writes only
    its provider's routes: a route without its key would fail every turn.
    """
    routes = {}
    for brain in BRAINS.values():
        if "runtime_model" not in brain:
            continue
        if provider is not None and brain["provider"] != provider:
            continue
        routes[brain["alias"]] = {"model": brain["runtime_model"], "provider": brain["provider"]}
    return routes
