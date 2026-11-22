"""runtime.py against real processes: a stand-in program that echoes what it receives, and the real
`hermes kanban` command line when it is installed. Neither starts a gateway or calls a model."""

import asyncio
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from src.common import config, profiles
from src.common.paths import PROJECT_ROOT
from src.features.board import runtime

PROJECT = "6d5c2141-efd5-40d9-8327-8f4dd8a1736f"
ECHO = """#!{python}
import json, os, sys
print(json.dumps({{"argv": sys.argv[1:], "stdin": sys.stdin.read(),
                  "home": os.environ.get("HERMES_HOME"), "board_env": os.environ.get("HERMES_KANBAN_BOARD")}}))
"""


class RuntimeProcessTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.echo = Path(folder.name) / "hermes"
        self.echo.write_text(ECHO.format(python=sys.executable))
        self.echo.chmod(self.echo.stat().st_mode | stat.S_IXUSR)
        for owner, name, value in ((config, "MULA_HERMES_BIN", str(self.echo)), (profiles, "RUNTIME_HOME", Path("/runtime-home"))):
            patcher = patch.object(owner, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_arguments_arrive_literally_without_a_shell(self):
        with patch.dict(os.environ, {"HERMES_KANBAN_BOARD": "someone-else"}):
            echoed = asyncio.run(runtime.run_json(["--board", "mula-x", "comment", "t_1", "--", "$(whoami); -rf `id`"], stdin="line\n--flag"))
        self.assertEqual(echoed["argv"], ["kanban", "--board", "mula-x", "comment", "t_1", "--", "$(whoami); -rf `id`"])
        self.assertEqual(echoed["stdin"], "line\n--flag")
        self.assertEqual(echoed["home"], "/runtime-home")
        # A stray board setting in the backend's environment can never pick another board.
        self.assertIsNone(echoed["board_env"])

    def test_board_commands_always_name_the_projects_board(self):
        echoed = asyncio.run(runtime.on_board(PROJECT, ["list", "--json"], as_json=True))
        self.assertEqual(echoed["argv"][:3], ["kanban", "--board", "mula-6d5c2141efd540d983278f4dd8a1736f"])

    def test_missing_runtime_is_a_clear_503(self):
        with patch.object(config, "MULA_HERMES_BIN", "/nonexistent/hermes"):
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(runtime.run(["list"]))
        self.assertEqual(caught.exception.status_code, 503)

    def test_slug_fits_the_runtimes_rule(self):
        slug = runtime.board_slug(PROJECT)
        self.assertRegex(slug, r"^[a-z0-9][a-z0-9_-]{0,63}$")


REAL_HERMES = PROJECT_ROOT / ".runtime" / "hermes-source" / ".hermes" / "bin" / "hermes"
REAL_HOME = PROJECT_ROOT / ".runtime" / "hermes"


@unittest.skipUnless(REAL_HERMES.is_file() and REAL_HOME.is_dir(), "the Mula runtime is not installed here")
class RealKanbanTests(unittest.TestCase):
    """The real command line, with boards in a throwaway folder (HERMES_KANBAN_HOME). The runtime's
    home is only read for its installed packages; no gateway runs, so nothing is dispatched."""

    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        for patcher in (patch.object(config, "MULA_HERMES_BIN", str(REAL_HERMES)), patch.object(profiles, "RUNTIME_HOME", REAL_HOME),
                        patch.dict(os.environ, {"HERMES_KANBAN_HOME": folder.name}), patch.object(runtime, "_known_boards", set())):
            patcher.start()
            self.addCleanup(patcher.stop)

    def board(self, *args, stdin=None, as_json=False):
        return asyncio.run(runtime.on_board(PROJECT, list(args), stdin, as_json))

    def status(self, card_id):
        return self.board("show", card_id, "--json", as_json=True)["task"]["status"]

    def test_a_parked_card_stays_parked_until_unblocked(self):
        asyncio.run(runtime.ensure_board(PROJECT, "Test shop"))
        asyncio.run(runtime.ensure_board(PROJECT, "Test shop"))  # once only
        task = self.board("create", "--initial-status", "blocked", "--created-by", "owner", "--body-file", "-", "--json",
                          "--assignee", "mula-abc", "--", "-Restock rice", stdin="Five sacks\n--not-a-flag", as_json=True)
        self.assertEqual((task["status"], task["title"], task["body"]), ("blocked", "-Restock rice", "Five sacks\n--not-a-flag"))
        for _ in range(3):
            # Listing runs the runtime's own promotion pass; a parked card must survive it.
            listed = self.board("list", "--json", as_json=True)
            self.assertEqual([(t["id"], t["status"]) for t in listed], [(task["id"], "blocked")])
        self.board("set-model", task["id"], "qwen/qwen3.8-27b", "--provider", "openrouter")
        self.board("comment", task["id"], "--author", "owner", "--", "-1 sack")
        self.board("unblock", task["id"])
        self.assertEqual(self.status(task["id"]), "ready")
        self.board("block", task["id"])
        self.board("list", "--json", as_json=True)
        self.assertEqual(self.status(task["id"]), "blocked")
        self.board("complete", task["id"], "--summary", "Done by owner")
        self.assertEqual(self.status(task["id"]), "done")
        self.board("archive", task["id"])
        self.assertEqual(self.board("list", "--json", as_json=True), [])

    def test_unknown_card_is_reported_as_missing(self):
        asyncio.run(runtime.ensure_board(PROJECT, "Test shop"))
        with self.assertRaises(runtime.KanbanError) as caught:
            self.board("show", "t_00000000", "--json")
        self.assertTrue(caught.exception.missing)


if __name__ == "__main__":
    unittest.main()
