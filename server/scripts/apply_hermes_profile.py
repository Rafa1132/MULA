"""Apply the version-checked Mula small-context exception to pinned Hermes.

Upstream refuses any model with less than 64k context, once when an agent is
built and again before each request that offers tools. The exception lets the
configured local Qwen (40,960 tokens) run on the API server only while every
tool it has is one of Mula's own business tools (`mcp__mula__*`), whose schemas
are small. Any other tool, platform or model keeps the upstream guards.
"""
from pathlib import Path
import subprocess

BACKEND = Path(__file__).resolve().parents[1]
SOURCE = BACKEND.parent / ".runtime" / "hermes-source"
ANCHOR = 'def _enforce_minimum_context(agent):\n'
# The earlier tool-free version, upgraded in place by main().
PREVIOUS_REPLACEMENT = '''def _enforce_minimum_context(agent):
    # Mula's explicitly configured chat-only Operator has no tool schema budget.
    # Keep upstream's guard for other profiles, models, platforms and all tools.
    from hermes_cli.config import load_config
    compact_operator = (load_config().get("agent") or {}).get("mula_compact_operator") is True
    context = getattr(agent.context_compressor, "context_length", 0)
    if (
        compact_operator
        and agent.platform == "api_server"
        and agent.model == "huihui_ai/qwen3-abliterated:latest"
        and not agent.tools
        and isinstance(context, int)
        and 8192 <= context <= 40960
    ):
        return
'''
REPLACEMENT = '''def _mula_compact_agent(agent):
    """Mula's configured agents: local Qwen on the API server with only Mula's own small tools."""
    from hermes_cli.config import load_config
    compact_operator = (load_config().get("agent") or {}).get("mula_compact_operator") is True
    context = getattr(agent.context_compressor, "context_length", 0)
    tool_names = [((tool or {}).get("function") or {}).get("name") for tool in (agent.tools or [])]
    return (
        compact_operator
        and agent.platform == "api_server"
        and agent.model == "huihui_ai/qwen3-abliterated:latest"
        and all(isinstance(name, str) and name.startswith("mcp__mula__") for name in tool_names)
        and len(tool_names) <= 5
        and isinstance(context, int)
        and 8192 <= context <= 40960
    )


def _enforce_minimum_context(agent):
    # Keep upstream's guard for other profiles, models, platforms and all other tools.
    if _mula_compact_agent(agent):
        return
'''
LOOP_ANCHOR = '''def _ollama_context_limit_error(agent: Any, request_tokens: int) -> Optional[str]:
    """Return a user-facing error when Ollama is loaded with too little context."""
'''
LOOP_REPLACEMENT = LOOP_ANCHOR + '''    # Mula: the same scoped exception as agent_init._enforce_minimum_context.
    from agent.agent_init import _mula_compact_agent
    if _mula_compact_agent(agent):
        return None
'''
# (file, anchor, replacement, earlier replacements that may be upgraded in place)
PATCHES = (
    ("agent/agent_init.py", ANCHOR, REPLACEMENT, (PREVIOUS_REPLACEMENT,)),
    ("agent/conversation_loop.py", LOOP_ANCHOR, LOOP_REPLACEMENT, ()),
)


def pristine_source(relative):
    return subprocess.check_output(["git", "-C", str(SOURCE), "show", f"HEAD:{relative}"], text=True)


def main():
    expected = (BACKEND / "hermes/revision.txt").read_text(encoding="utf-8").strip()
    actual = subprocess.check_output(["git", "-C", str(SOURCE), "rev-parse", "HEAD"], text=True).strip()
    if actual != expected:
        raise SystemExit("Hermes revision differs; context patch was not applied.")
    # Check every file before writing any, so a refusal never leaves a half-applied patch.
    pending = []
    for relative, anchor, replacement, previous in PATCHES:
        path = SOURCE / relative
        text = path.read_text(encoding="utf-8")
        pristine = pristine_source(relative)
        if pristine.count(anchor) != 1:
            raise SystemExit(f"Hermes context guard changed in {relative}; review the patch before applying.")
        patched = pristine.replace(anchor, replacement, 1)
        if text == patched:
            continue
        accepted = [pristine] + [pristine.replace(anchor, older, 1) for older in previous]
        if text not in accepted:
            raise SystemExit(f"Hermes file {relative} has other edits; existing changes were preserved.")
        pending.append((path, patched))
    for path, patched in pending:
        path.write_text(patched, encoding="utf-8")
    if pending:
        print("Applied the Mula agents context profile.")


if __name__ == "__main__":
    main()
