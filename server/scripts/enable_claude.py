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
import getpass
import os
from pathlib import Path
import sys
import tempfile

import yaml

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from src.common.brains import runtime_routes  # noqa: E402  (needs the backend on sys.path)

RUNTIME_HOME = BACKEND.parent / ".runtime" / "hermes"
KEY_NAME = "ANTHROPIC_API_KEY"
# Subscription tokens outrank an API key in the runtime's credential lookup.
SUBSCRIPTION_TOKEN_NAMES = ("ANTHROPIC_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN")


def write_private(path: Path, content: str) -> None:
    """Replace a file atomically, readable only by its owner."""
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            file.write(content)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


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


def env_lines_without(text: str, names: tuple[str, ...]) -> list[str]:
    kept = []
    for line in text.splitlines():
        name = line.split("=", 1)[0].strip()
        if name.startswith("export "):
            name = name[len("export "):].strip()
        if name not in names:
            kept.append(line)
    return kept


def env_defines(text: str, names: tuple[str, ...]) -> bool:
    return len(env_lines_without(text, names)) != len(text.splitlines())


def mapping_at(parent: dict, key: str) -> dict:
    value = parent.setdefault(key, {})
    if value is None:
        value = parent[key] = {}
    if not isinstance(value, dict):
        raise SystemExit(f"The runtime config's {key} setting is not a mapping. Nothing was changed.")
    return value


def updated_config(config: dict, enable: bool) -> dict:
    api_server = mapping_at(mapping_at(config, "gateway"), "api_server")
    routes = mapping_at(api_server, "model_routes")
    # Other routes the owner configured are preserved; only Mula's Claude aliases change.
    for alias in runtime_routes():
        routes.pop(alias, None)
    if enable:
        routes.update(runtime_routes())
    if routes:
        api_server["model_routes"] = routes
    else:
        api_server.pop("model_routes", None)
    return config


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--disable", action="store_true", help="Remove the Claude brains and the stored API key.")
    arguments = parser.parse_args(argv)
    env_path = RUNTIME_HOME / ".env"
    config_path = RUNTIME_HOME / "config.yaml"
    if not env_path.is_file() or not config_path.is_file():
        raise SystemExit("Run setup_hermes.py first. See server/README.md.")
    env_text = env_path.read_text(encoding="utf-8")
    if env_defines(env_text, SUBSCRIPTION_TOKEN_NAMES):
        raise SystemExit(
            f"{env_path} defines {' or '.join(SUBSCRIPTION_TOKEN_NAMES)}. Remove subscription tokens "
            "from the runtime profile first; they would be used instead of an API key."
        )
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise SystemExit("The runtime config is not a YAML mapping. Nothing was changed.")

    lines = env_lines_without(env_text, (KEY_NAME,))
    new_config = yaml.safe_dump(updated_config(config, not arguments.disable), sort_keys=False)
    # Claude routes must never exist without the key: without it the runtime would
    # borrow the owner's personal Claude login. So the key is written before the
    # routes when enabling, and removed after them when disabling.
    if arguments.disable:
        write_private(config_path, new_config)
        write_private(env_path, "\n".join(lines) + "\n")
        print("Removed the Claude brains and the stored API key.")
    else:
        key = validate_key(getpass.getpass("Claude Console API key (input hidden): "))
        lines.append(f"{KEY_NAME}={key}")
        write_private(env_path, "\n".join(lines) + "\n")
        write_private(config_path, new_config)
        print("Added the Claude brains. The key was saved to the private runtime profile and not printed.")
    print("Restart the runtime: bash server/scripts/start_hermes.sh --replace")


if __name__ == "__main__":
    main()
