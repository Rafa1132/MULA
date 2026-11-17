"""Add (or with --disable, remove) the Claude brains in the private Mula runtime profile.

Run with the backend environment, which provides PyYAML:
    server/.venv/bin/python server/scripts/enable_claude.py

The script stores a Claude Console API key in `.runtime/hermes/.env` and writes one
`gateway.api_server.model_routes` entry per Claude brain into
`.runtime/hermes/config.yaml`. Restart the runtime afterwards.

Only Console API keys are accepted. Anthropic does not allow products to route
their users' requests through Claude Free/Pro/Max subscription credentials, and
the runtime would otherwise fall back to the owner's personal Claude Code login.
"""
import argparse
import getpass  # noqa: F401  (tests patch getpass.getpass through this module)
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from scripts.cloud_brains import Provider, env_defines, run  # noqa: E402  (needs the backend on sys.path)

RUNTIME_HOME = BACKEND.parent / ".runtime" / "hermes"
KEY_NAME = "ANTHROPIC_API_KEY"
# Subscription tokens outrank an API key in the runtime's credential lookup.
SUBSCRIPTION_TOKEN_NAMES = ("ANTHROPIC_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN")


def validate_key(key: str) -> str:
    key = key.strip()
    if key.startswith("sk-ant-oat") or key.startswith("eyJ"):
        raise SystemExit(
            "That is a Claude subscription token, not an API key. Create an API key in the Claude Console "
            "(platform.claude.com); subscription credentials may not be used to serve Mula's users."
        )
    if not key.startswith("sk-ant-api") or any(character.isspace() for character in key):
        raise SystemExit("Enter a Claude Console API key; it starts with sk-ant-api. Nothing was changed.")
    return key


def refuse_subscription_tokens(env_text: str, env_path: Path) -> None:
    if env_defines(env_text, SUBSCRIPTION_TOKEN_NAMES):
        raise SystemExit(
            f"{env_path} defines {' or '.join(SUBSCRIPTION_TOKEN_NAMES)}. Remove subscription tokens "
            "from the runtime profile first; they would be used instead of an API key."
        )


CLAUDE = Provider(name="anthropic", label="Claude", key_name=KEY_NAME, validate_key=validate_key,
                  check_env=refuse_subscription_tokens)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--disable", action="store_true", help="Remove the Claude brains and the stored API key.")
    arguments = parser.parse_args(argv)
    # RUNTIME_HOME is read here, not imported by the shared module, so tests can point it elsewhere.
    run(CLAUDE, RUNTIME_HOME, arguments.disable)


if __name__ == "__main__":
    main()
