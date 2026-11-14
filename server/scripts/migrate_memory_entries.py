"""Import the old Markdown memory files into each account's memory store.

Dry run by default; --apply writes. Run with the backend environment:
    server/.venv/bin/python server/scripts/migrate_memory_entries.py [--apply]

Each paragraph of the old files becomes one entry, through the same pipeline as every
other save, so the sensitive-data filter and the duplicate check apply. Preferences
and fun facts become facts about the owner; everything else is about the business.
`decisions/superseded.md` is imported and retired at once, so the history is kept but
nothing superseded reaches a prompt. The Markdown files are left exactly as they are.
"""
import argparse
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from src.features.memory import filters, pipeline, store  # noqa: E402
from src.features.memory.filters import MemoryRefused  # noqa: E402

CATEGORIES = {
    "important-facts": ["business-identity", "goals", "boundaries"],
    "business-knowledge": ["products-and-services", "suppliers", "operating-routines"],
    "preferences": ["communication", "working-style"],
    "fun-facts": ["interests", "milestones"],
    "random-facts": ["miscellaneous"],
    "decisions": ["current", "superseded"],
}
OWNER_CATEGORIES = {"preferences", "fun-facts"}
SUPERSEDED_FILE = "decisions/superseded.md"


def paragraphs(path: Path) -> list[str]:
    """The fact paragraphs of an old memory file, without its metadata line and heading."""
    raw = path.read_text(encoding="utf-8")
    if raw.startswith("<!-- mula-memory "):
        raw = raw.partition("\n")[2]
    found = []
    for block in raw.split("\n\n"):
        text = " ".join(block.split())
        if not text or text.startswith("# "):
            continue
        found.append(text)
    return found


def legacy_files(folder: Path):
    for category, names in CATEGORIES.items():
        for name in names:
            relative = f"{category}/{name}.md"
            path = folder / relative
            if path.is_file() and not path.is_symlink():
                yield relative, category, path


def workspaces() -> list[Path]:
    root = store.DATA_DIR / "workspaces"
    if not root.is_dir():
        return []
    return sorted(entry for entry in root.iterdir() if (entry / "memory" / ".initialized").is_file())


def migrate(workspace: Path, apply: bool) -> dict[str, int]:
    counts = {"imported": 0, "duplicates": 0, "refused": 0, "retired": 0}
    account_id = workspace.name
    for relative, category, path in legacy_files(workspace / "memory"):
        target = "business"
        if category in OWNER_CATEGORIES:
            target = "owner"
        for fact in paragraphs(path):
            if not apply:
                try:
                    filters.check(fact)
                    counts["imported"] += 1
                except MemoryRefused:
                    counts["refused"] += 1
                continue
            if already_imported(account_id, fact):
                # Retired imports are no longer active, so the pipeline's duplicate check would miss them.
                counts["duplicates"] += 1
                continue
            try:
                result = pipeline.remember(account_id, target, fact, "migration")
            except MemoryRefused:
                counts["refused"] += 1
                continue
            if result["outcome"] == "duplicate":
                counts["duplicates"] += 1
                continue
            counts["imported"] += 1
            if relative == SUPERSEDED_FILE:
                pipeline.retire(account_id, result["entry"]["id"], "migration")
                counts["retired"] += 1
    return counts


def already_imported(account_id: str, fact: str) -> bool:
    with store.open_store(account_id) as db:
        row = db.execute("SELECT 1 FROM entries WHERE actor = 'migration' AND normalized = ? LIMIT 1", (filters.normalize(fact),)).fetchone()
    return row is not None


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Write the entries. Without it, only report.")
    arguments = parser.parse_args(argv)
    found = workspaces()
    if not found:
        print(f"No old memory folders under {store.DATA_DIR / 'workspaces'}. Nothing to do.")
        return
    for workspace in found:
        counts = migrate(workspace, arguments.apply)
        summary = ", ".join(f"{value} {name}" for name, value in counts.items())
        print(f"{workspace.name}: {summary}")
    if arguments.apply:
        print("Imported through the memory pipeline. The Markdown files were left in place as a legacy copy.")
    else:
        print("Dry run; nothing was written. Add --apply to import.")


if __name__ == "__main__":
    main()
