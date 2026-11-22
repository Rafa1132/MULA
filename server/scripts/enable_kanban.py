"""Apply the Board's kanban settings to an existing runtime install. Dry run by default.

Run with the backend environment, which provides PyYAML:
    server/.venv/bin/python server/scripts/enable_kanban.py          # report only
    server/.venv/bin/python server/scripts/enable_kanban.py --apply  # write

New installs get these settings from the template `server/hermes/config.yaml`, which is copied
only when `.runtime/hermes/config.yaml` doesn't exist yet. This script copies the template's
`kanban:` block into the existing config and changes nothing else. Restart Mula afterwards.
See server/src/features/board/README.md for why each setting is there.
"""

import argparse
from pathlib import Path
import os
import sys

import yaml

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from scripts.cloud_brains import mapping_at, write_private  # noqa: E402

RUNTIME_HOME = Path(os.environ.get("HERMES_HOME", "").strip() or BACKEND.parent / ".runtime" / "hermes")


def template_settings() -> dict:
    template = yaml.safe_load((BACKEND / "hermes" / "config.yaml").read_text(encoding="utf-8"))
    return template["kanban"]


def changes(config: dict, wanted: dict) -> dict:
    """The settings whose value differs from the template's, as {name: (current, wanted)}."""
    current = config.get("kanban")
    if not isinstance(current, dict):
        current = {}
    return {name: (current.get(name), value) for name, value in wanted.items() if current.get(name) != value}


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Write the settings. Without it, only report.")
    arguments = parser.parse_args(argv)
    config_path = RUNTIME_HOME / "config.yaml"
    if not config_path.is_file():
        raise SystemExit("Run setup_hermes.py first. See server/README.md.")
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise SystemExit("The runtime config is not a YAML mapping. Nothing was changed.")
    wanted = template_settings()
    pending = changes(config, wanted)
    if not pending:
        print("The Board's kanban settings are already in place.")
        return
    for name, (current, value) in pending.items():
        print(f"kanban.{name}: {current!r} -> {value!r}")
    if not arguments.apply:
        print("Dry run; nothing was written. Add --apply to write.")
        return
    mapping_at(config, "kanban").update(wanted)
    write_private(config_path, yaml.safe_dump(config, sort_keys=False))
    print("Wrote the kanban settings. Restart Mula and the backend.")


if __name__ == "__main__":
    main()
