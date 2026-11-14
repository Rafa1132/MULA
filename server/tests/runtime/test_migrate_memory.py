import contextlib
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from scripts import migrate_memory_entries
from src.features.memory import service, store


def tree_digest(folder):
    digests = {}
    for path in sorted(folder.rglob("*")):
        if path.is_file() and path.name != "store.sqlite3" and path.name != "MEMORY.md":
            digests[str(path.relative_to(folder))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return digests


class MigrateMemoryTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        # The memory stores live under the data folder; the migration never needs the application database.
        patcher = patch.object(store, "DATA_DIR", root)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.account_id = str(uuid4())
        self.folder = root / "workspaces" / self.account_id / "memory"
        for category in ("important-facts", "business-knowledge", "preferences", "fun-facts", "random-facts", "decisions"):
            (self.folder / category).mkdir(parents=True)
        (self.folder / ".initialized").write_text("1\n")
        (self.folder / "business-knowledge/suppliers.md").write_text(
            '<!-- mula-memory {"source": "Owner"} -->\n# Suppliers\n\nOur coffee supplier is Aroma.\n\nDeliveries arrive on Tuesdays.\n')
        (self.folder / "preferences/communication.md").write_text("# Communication\n\nKeep answers short.\n")
        (self.folder / "decisions/superseded.md").write_text("# Superseded decisions\n\nWe used to buy from Previous Beans.\n")
        (self.folder / "random-facts/miscellaneous.md").write_text("# Miscellaneous\n\npassword = topsecret1\n")
        (self.folder / "important-facts/goals.md").write_text("# Goals\n\n")

    def run_script(self, *arguments):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            migrate_memory_entries.main(list(arguments))
        return output.getvalue()

    def test_dry_run_counts_and_leaves_files_byte_identical(self):
        before = tree_digest(self.folder)
        output = self.run_script()
        self.assertIn("4 imported, 0 duplicates, 1 refused", output)
        self.assertEqual(tree_digest(self.folder), before)
        self.assertFalse((self.folder / "store.sqlite3").exists())

    def test_apply_imports_through_the_pipeline_and_is_repeatable(self):
        before = tree_digest(self.folder)
        output = self.run_script("--apply")
        self.assertIn("4 imported, 0 duplicates, 1 refused, 1 retired", output)
        self.assertEqual(tree_digest(self.folder), before)
        with store.open_store(self.account_id) as db:
            entries = store.all_entries(db)
        facts = {entry["fact"]: entry for entry in entries}
        self.assertEqual(facts["Keep answers short."]["target"], "owner")
        self.assertEqual(facts["Our coffee supplier is Aroma."]["target"], "business")
        self.assertEqual(facts["We used to buy from Previous Beans."]["superseded_reason"], "retired")
        self.assertTrue(all(entry["actor"] == "migration" for entry in entries))
        self.assertNotIn("topsecret1", str(facts))
        summary = service.overview(self.account_id)["summary"]
        self.assertIn("Aroma", summary)
        self.assertNotIn("Previous Beans", summary)
        again = self.run_script("--apply")
        self.assertIn("0 imported, 4 duplicates, 1 refused, 0 retired", again)
