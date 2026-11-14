"""Give every account its own Mula runtime profile. Dry run by default; --apply writes.

Run with the backend environment, which provides PyYAML:
    server/.venv/bin/python server/scripts/provision_profiles.py          # report only
    server/.venv/bin/python server/scripts/provision_profiles.py --apply  # write

With --apply the script:
- adds a MULA_PROFILE_KEY_SEED to `server/.env.hermes` when there is none (new installs
  get it from setup_hermes.py);
- turns on `gateway.multiplex_profiles` in `.runtime/hermes/config.yaml`;
- writes `.runtime/hermes/profiles/mula-<account>/` for every account, and refreshes
  the profiles that already exist so they carry the current config and secrets.

Nothing is moved or deleted. Runtime sessions start fresh in the new profiles; the
visible chat history in Mula's own database is untouched. Restart Mula afterwards.
"""
import argparse
import os
from pathlib import Path
import secrets
import sqlite3
import sys

import yaml

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from scripts.enable_claude import env_lines_without, mapping_at, write_private  # noqa: E402
from src.common import profiles  # noqa: E402

RUNTIME_HOME = BACKEND.parent / ".runtime" / "hermes"
SEED_NAME = "MULA_PROFILE_KEY_SEED"


def account_ids(database: Path) -> list[str]:
    if not database.is_file():
        return []
    connection = sqlite3.connect(database)
    try:
        return [row[0] for row in connection.execute("SELECT id FROM accounts ORDER BY rowid")]
    finally:
        connection.close()


def ensure_seed(backend_env: Path) -> str:
    """The seed from the backend env file, generated and saved when missing."""
    values = profiles.env_values(backend_env)
    if values.get(SEED_NAME):
        return values[SEED_NAME]
    seed = secrets.token_urlsafe(32)
    lines = env_lines_without(backend_env.read_text(encoding="utf-8"), (SEED_NAME,))
    lines.append(f"{SEED_NAME}={seed}")
    write_private(backend_env, "\n".join(lines) + "\n")
    return seed


def enable_multiplexing(config_path: Path) -> bool:
    """Set gateway.multiplex_profiles in the root config; returns whether it changed."""
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise SystemExit("The runtime config is not a YAML mapping. Nothing was changed.")
    gateway = mapping_at(config, "gateway")
    if gateway.get("multiplex_profiles") is True:
        return False
    gateway["multiplex_profiles"] = True
    write_private(config_path, yaml.safe_dump(config, sort_keys=False))
    return True


def refresh_existing_profiles(backend_env: Path, runtime_home: Path) -> int:
    """Rewrite the account profiles already on disk with the current template and secrets.

    Used after a script changes the root `.env`, so every profile mirrors the new key.
    Returns the number refreshed, or -1 when the seed is not set up yet.
    """
    seed = profiles.env_values(backend_env).get(SEED_NAME, "")
    if not seed:
        return -1
    folders = []
    with configured(seed, runtime_home):
        folders = profiles.existing_profiles()
        for folder in folders:
            account_id = account_id_of(folder.name)
            if account_id is not None:
                profiles.ensure_profile(account_id)
    return len(folders)


def account_id_of(profile_name: str) -> str | None:
    """The account UUID a profile folder was derived from, or None for a foreign folder."""
    from uuid import UUID
    try:
        return str(UUID(profile_name.removeprefix("mula-")))
    except ValueError:
        return None


class configured:
    """Point the profiles module at this script's paths and seed for the duration."""

    def __init__(self, seed: str, runtime_home: Path):
        self.values = {"KEY_SEED": seed, "RUNTIME_HOME": runtime_home}
        self.previous = {}

    def __enter__(self):
        for name, value in self.values.items():
            self.previous[name] = getattr(profiles, name)
            setattr(profiles, name, value)
        return self

    def __exit__(self, *_):
        for name, value in self.previous.items():
            setattr(profiles, name, value)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Write the seed, the flag and the profiles. Without it, only report.")
    arguments = parser.parse_args(argv)
    backend_env = BACKEND / ".env.hermes"
    config_path = RUNTIME_HOME / "config.yaml"
    if not backend_env.is_file() or not config_path.is_file():
        raise SystemExit("Run setup_hermes.py first. See server/README.md.")
    database = Path(os.getenv("LARAS_ACCOUNT_DB", str(BACKEND.parent / ".runtime" / "accounts.sqlite3")))
    ids = account_ids(database)
    seed = profiles.env_values(backend_env).get(SEED_NAME, "")
    root_config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    multiplexed = isinstance(root_config.get("gateway"), dict) and root_config["gateway"].get("multiplex_profiles") is True
    with configured(seed or "dry-run", RUNTIME_HOME):
        missing = [account_id for account_id in ids if not profiles.profile_dir(account_id).is_dir()]
        leaking = profiles.profiles_with_runtime_memory()
    print(f"Accounts: {len(ids)}. Without a profile: {len(missing)}. Profiles with the runtime's memory on: {len(leaking)}.")
    seed_state = "missing"
    if seed:
        seed_state = "present"
    flag_state = "off"
    if multiplexed:
        flag_state = "on"
    print(f"Profile key seed in server/.env.hermes: {seed_state}. gateway.multiplex_profiles: {flag_state}.")
    if not arguments.apply:
        print("Dry run; nothing was written. Add --apply to provision.")
        return
    seed = ensure_seed(backend_env)
    changed = enable_multiplexing(config_path)
    with configured(seed, RUNTIME_HOME):
        for account_id in ids:
            profiles.ensure_profile(account_id)
    print(f"Wrote {len(ids)} account profile(s) under .runtime/hermes/profiles/. The seed and keys were not printed.")
    if changed:
        print("Turned on gateway.multiplex_profiles in the runtime config.")
    print("Restart Mula and the backend: ./run.sh")


if __name__ == "__main__":
    main()
