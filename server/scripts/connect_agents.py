"""Connect (or with --disable, disconnect) Mula agents to the backend's agent tools.

Run with the backend environment, which provides PyYAML:
    server/.venv/bin/python server/scripts/connect_agents.py

New installs get this from setup_hermes.py. For an existing profile, the script
generates a shared MULA_TOOLS_KEY in `server/.env.hermes` and
`.runtime/hermes/.env`, and copies the `mula` tool server and toolset policy
from the template `server/hermes/config.yaml` into `.runtime/hermes/config.yaml`.
Restart Mula and the backend afterwards.
"""

import argparse
from pathlib import Path
import secrets
import sys

import yaml

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from scripts.enable_claude import env_lines_without, mapping_at, write_private  # noqa: E402

RUNTIME_HOME = BACKEND.parent / ".runtime" / "hermes"
KEY_NAME = "MULA_TOOLS_KEY"
SERVER_NAME = "mula"


def template_policy():
    """The tool server entry, platform toolsets and tool search setting from the profile template."""
    template = yaml.safe_load((BACKEND / "hermes" / "config.yaml").read_text(encoding="utf-8"))
    return template["mcp_servers"][SERVER_NAME], template["platform_toolsets"], template["tools"]["tool_search"]


def updated_config(config: dict, enable: bool) -> dict:
    servers = mapping_at(config, "mcp_servers")
    toolsets = mapping_at(config, "platform_toolsets")
    # Other servers the owner configured are kept, but the agents' platforms only
    # ever see Mula's own tools: anything broader breaks the small-context exception.
    servers.pop(SERVER_NAME, None)
    if enable:
        server, policy, tool_search = template_policy()
        servers[SERVER_NAME] = server
        toolsets.update(policy)
        mapping_at(config, "tools")["tool_search"] = tool_search
    else:
        toolsets["api_server"] = []
        toolsets["cli"] = []
    return config


def write_key(path: Path, key: str | None) -> None:
    lines = []
    if path.exists():
        lines = env_lines_without(path.read_text(encoding="utf-8"), (KEY_NAME,))
    if key is not None:
        lines.append(f"{KEY_NAME}={key}")
    write_private(path, "\n".join(lines) + "\n")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--disable", action="store_true", help="Disconnect agent tools and remove the shared key.")
    arguments = parser.parse_args(argv)
    runtime_env = RUNTIME_HOME / ".env"
    config_path = RUNTIME_HOME / "config.yaml"
    backend_env = BACKEND / ".env.hermes"
    if not runtime_env.is_file() or not config_path.is_file() or not backend_env.is_file():
        raise SystemExit("Run setup_hermes.py first. See server/README.md.")
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise SystemExit("The runtime config is not a YAML mapping. Nothing was changed.")
    new_config = yaml.safe_dump(updated_config(config, not arguments.disable), sort_keys=False)
    # The tool server is only configured while both sides hold the key, so the
    # runtime never calls the backend with an unresolved placeholder.
    if arguments.disable:
        write_private(config_path, new_config)
        write_key(runtime_env, None)
        write_key(backend_env, None)
        print("Disconnected agent tools and removed the shared key.")
    else:
        key = secrets.token_urlsafe(32)
        write_key(backend_env, key)
        write_key(runtime_env, key)
        write_private(config_path, new_config)
        print("Connected agent tools. The shared key was saved to both private env files and not printed.")
    print("Restart Mula and the backend: ./run.sh")


if __name__ == "__main__":
    main()
