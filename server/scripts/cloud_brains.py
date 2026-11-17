"""Shared steps for the scripts that add or remove a cloud provider's brains.

Each provider has its own script (`enable_claude.py`, `enable_openrouter.py`) that names its
provider, its key variable and how a valid key looks. This module does the rest the same way
for every provider: it stores the key in the private runtime profile, writes only that
provider's `gateway.api_server.model_routes` entries, keeps every other route, and refreshes
the account profiles, which read only their own `.env`.
"""
from dataclasses import dataclass
import getpass
import os
from pathlib import Path
import sys
import tempfile
from typing import Callable

import yaml

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from src.common.brains import runtime_routes  # noqa: E402  (needs the backend on sys.path)


@dataclass(frozen=True)
class Provider:
    # The runtime provider name the routes use, for example "anthropic".
    name: str
    # What owners call it in messages, for example "Claude".
    label: str
    # The runtime profile variable that holds the key.
    key_name: str
    # Returns the cleaned key or raises SystemExit with a message that never repeats the key.
    validate_key: Callable[[str], str]
    # Optional check of the profile's .env text before anything changes; raises SystemExit to refuse.
    check_env: Callable[[str, Path], None] | None = None


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


def updated_config(config: dict, provider: str, enable: bool) -> dict:
    api_server = mapping_at(mapping_at(config, "gateway"), "api_server")
    routes = mapping_at(api_server, "model_routes")
    # Other routes, the owner's or another provider's, are preserved; only this provider's aliases change.
    for alias in runtime_routes(provider):
        routes.pop(alias, None)
    if enable:
        routes.update(runtime_routes(provider))
    if routes:
        api_server["model_routes"] = routes
    else:
        api_server.pop("model_routes", None)
    return config


def run(provider: Provider, runtime_home: Path, disable: bool) -> None:
    env_path = runtime_home / ".env"
    config_path = runtime_home / "config.yaml"
    if not env_path.is_file() or not config_path.is_file():
        raise SystemExit("Run setup_hermes.py first. See server/README.md.")
    env_text = env_path.read_text(encoding="utf-8")
    if provider.check_env is not None:
        provider.check_env(env_text, env_path)
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise SystemExit("The runtime config is not a YAML mapping. Nothing was changed.")

    lines = env_lines_without(env_text, (provider.key_name,))
    new_config = yaml.safe_dump(updated_config(config, provider.name, not disable), sort_keys=False)
    # A route must never exist without its key, so the key is written before the routes when
    # enabling and removed after them when disabling.
    if disable:
        write_private(config_path, new_config)
        write_private(env_path, "\n".join(lines) + "\n")
        print(f"Removed the {provider.label} brains and the stored API key.")
    else:
        key = provider.validate_key(getpass.getpass(f"{provider.label} API key (input hidden): "))
        lines.append(f"{provider.key_name}={key}")
        write_private(env_path, "\n".join(lines) + "\n")
        write_private(config_path, new_config)
        print(f"Added the {provider.label} brains. The key was saved to the private runtime profile and not printed.")
    # Account profiles read only their own .env, so each must mirror the key (or lose it).
    from scripts.provision_profiles import refresh_existing_profiles
    refreshed = refresh_existing_profiles(BACKEND / ".env.hermes", runtime_home)
    if refreshed < 0:
        print("Account profiles are not set up yet; run provision_profiles.py --apply.")
    else:
        print(f"Refreshed {refreshed} account profile(s) with the current secrets.")
    print("Restart the runtime: bash server/scripts/start_hermes.sh --replace")
