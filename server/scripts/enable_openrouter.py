"""Add (or with --disable, remove) the OpenRouter brains in the private Mula runtime profile.

Run with the backend environment, which provides PyYAML:
    server/.venv/bin/python server/scripts/enable_openrouter.py

The script stores an OpenRouter API key in `.runtime/hermes/.env` and writes one
`gateway.api_server.model_routes` entry per OpenRouter brain into
`.runtime/hermes/config.yaml`. Restart the runtime afterwards.

Which host serves each model is pinned in the runtime templates
(`provider_routing.models` in server/hermes/*.yaml), so OpenRouter never moves a
request to a host the owner did not choose.
"""
import argparse
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from scripts.cloud_brains import Provider, run  # noqa: E402  (needs the backend on sys.path)

RUNTIME_HOME = BACKEND.parent / ".runtime" / "hermes"
KEY_NAME = "OPENROUTER_API_KEY"


def validate_key(key: str) -> str:
    key = key.strip()
    if not key.startswith("sk-or-") or any(character.isspace() for character in key):
        raise SystemExit("Enter an OpenRouter API key; it starts with sk-or-. Nothing was changed.")
    return key


OPENROUTER = Provider(name="openrouter", label="OpenRouter", key_name=KEY_NAME, validate_key=validate_key)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--disable", action="store_true", help="Remove the OpenRouter brains and the stored API key.")
    arguments = parser.parse_args(argv)
    run(OPENROUTER, RUNTIME_HOME, arguments.disable)


if __name__ == "__main__":
    main()
