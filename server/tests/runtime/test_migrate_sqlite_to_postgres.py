import contextlib
from datetime import timezone
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from uuid import uuid4

from scripts import migrate_sqlite_to_postgres as copy_script
from src.common import database
from src.features.auth import accounts
from src.features.agents import service as agents
from src.features.team import service as team
from tests.support.database_fixture import DatabaseFixture

# The schema the SQLite file had on a real installation, legacy memory tables included.
LEGACY_SCHEMA = '''
CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, conversation_id TEXT UNIQUE NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
CREATE TABLE messages (id INTEGER PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), role TEXT NOT NULL, text TEXT NOT NULL, note TEXT, agent_id TEXT NOT NULL DEFAULT 'operator');
CREATE TABLE login_failures (username TEXT NOT NULL, occurred INTEGER NOT NULL);
CREATE TABLE memory_documents (account_id TEXT NOT NULL, path TEXT NOT NULL, revision TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT, content TEXT NOT NULL, PRIMARY KEY(account_id, path));
CREATE VIRTUAL TABLE memory_chunks USING fts5(account_id UNINDEXED, path UNINDEXED, chunk_id UNINDEXED, content);
CREATE TABLE memory_changes (id INTEGER PRIMARY KEY, account_id TEXT NOT NULL, path TEXT NOT NULL, action TEXT NOT NULL, source TEXT NOT NULL, occurred_at TEXT NOT NULL, revision TEXT NOT NULL);
CREATE TABLE memory_retrievals (account_id TEXT PRIMARY KEY, question TEXT NOT NULL, occurred_at TEXT NOT NULL, sources TEXT NOT NULL);
CREATE TABLE agent_settings (account_id TEXT NOT NULL REFERENCES accounts(id), agent_id TEXT NOT NULL, prompt TEXT NOT NULL, data TEXT NOT NULL, tools TEXT NOT NULL, revision INTEGER NOT NULL, brain TEXT, delegation TEXT, PRIMARY KEY (account_id, agent_id));
CREATE TABLE forecast_runs (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), report TEXT NOT NULL, explanation TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE agent_map_positions (account_id TEXT NOT NULL REFERENCES accounts(id), agent_id TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, PRIMARY KEY (account_id, agent_id));
CREATE TABLE agent_tickets (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), agent_id TEXT NOT NULL, attachment TEXT, message_id INTEGER, depth INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE agent_requests (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), from_agent TEXT NOT NULL, to_agent TEXT NOT NULL, question TEXT NOT NULL, attachment TEXT, ticket_hash TEXT NOT NULL, message_id INTEGER, status TEXT NOT NULL, answer TEXT, created INTEGER NOT NULL, approved_in_advance INTEGER NOT NULL DEFAULT 0);
'''
ATTACHMENT = {"name": "sales.csv", "content": "date,units\n2026-01-01,3\n"}


class CopyScriptTests(DatabaseFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.source = Path(directory.name) / "accounts.sqlite3"
        self.account_id = str(uuid4())
        self.other_id = str(uuid4())
        with sqlite3.connect(self.source) as db:
            db.executescript(LEGACY_SCHEMA)
            db.execute("INSERT INTO accounts VALUES (?, 'rafa', 'ab', 'hash', ?)", (self.account_id, str(uuid4())))
            db.execute("INSERT INTO accounts VALUES (?, 'second', 'cd', 'hash2', ?)", (self.other_id, str(uuid4())))
            db.execute("INSERT INTO sessions VALUES ('tok', ?, 4102444800)", (self.account_id,))
            db.execute("INSERT INTO messages (id, account_id, role, text, note) VALUES (7, ?, 'user', 'hello', NULL)", (self.account_id,))
            db.execute("INSERT INTO messages (id, account_id, role, text, note, agent_id) VALUES (9, ?, 'assistant', 'hi', 'Memory used: [1]', 'operator')", (self.account_id,))
            db.execute("INSERT INTO login_failures VALUES ('rafa', 1700000000)")
            db.execute("INSERT INTO memory_documents VALUES (?, 'important-facts/goals.md', 'r1', 'template', NULL, '')", (self.account_id,))
            db.execute("INSERT INTO agent_settings VALUES (?, 'operator', 'Be brief', '', '[\"csv_read\", \"memory_read\"]', 3, NULL, 'auto')", (self.account_id,))
            db.execute("INSERT INTO forecast_runs (id, account_id, report, explanation, created_at) VALUES ('run-1', ?, ?, 'because', '2026-11-01 08:30:00')",
                       (self.account_id, json.dumps({"method": "naive", "history": [], "forecast": []})))
            db.execute("INSERT INTO agent_map_positions VALUES (?, 'operator', 0.25, 0.5)", (self.account_id,))
            db.execute("INSERT INTO agent_tickets VALUES ('hash-a', ?, 'forecasting', ?, 9, 0, 4102444800)", (self.account_id, json.dumps(ATTACHMENT)))
            db.execute("INSERT INTO agent_requests VALUES ('req-1', ?, 'operator', 'forecasting', 'How many?', ?, 'hash-a', 9, 'pending', NULL, 1700000000, 1)",
                       (self.account_id, json.dumps(ATTACHMENT)))
        self.digest = hashlib.sha256(self.source.read_bytes()).hexdigest()

    def run_script(self, *arguments):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            try:
                status = copy_script.main(["--source", str(self.source), "--database-url", database.DATABASE_URL, "--schema", self.schema, *arguments])
            except SystemExit as stop:
                status = stop
        return status, output.getvalue()

    def counts(self):
        with database.database() as db:
            return {table: db.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"] for table in copy_script.TABLES}

    def test_dry_run_reports_and_writes_nothing(self):
        status, output = self.run_script()
        self.assertEqual(status, 0)
        self.assertIn("messages: 2", output)
        self.assertIn("Legacy memory tables, not copied", output)
        self.assertIn("memory_documents: 1", output)
        self.assertIn("Dry run", output)
        self.assertEqual(sum(self.counts().values()), 0)
        self.assertNotIn("hello", output)

    def test_apply_copies_every_table_with_ids_and_types_preserved(self):
        status, output = self.run_script("--apply")
        self.assertEqual(status, 0, output)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.digest)
        self.assertEqual(self.counts(), {"accounts": 2, "sessions": 1, "messages": 2, "login_failures": 1, "agent_settings": 1,
                                         "agent_map_positions": 1, "forecast_runs": 1, "agent_tickets": 1, "agent_requests": 1})
        self.assertEqual([message["id"] for message in accounts.history(self.account_id)], [7, 9])
        # New messages continue after the copied ids.
        self.assertGreater(accounts.add_message(self.account_id, "user", "next"), 9)
        settings = team.settings(self.account_id, "operator")
        self.assertEqual((settings["tools"], settings["revision"], settings["delegation"]), (["csv_read", "memory_read"], 3, "auto"))
        with database.database() as db:
            run = db.execute("SELECT report, created_at FROM forecast_runs WHERE id = 'run-1'").fetchone()
            request = db.execute("SELECT approved_in_advance, attachment FROM agent_requests WHERE id = 'req-1'").fetchone()
            ticket = db.execute("SELECT attachment, message_id FROM agent_tickets WHERE token_hash = 'hash-a'").fetchone()
            order = [row["username"] for row in db.execute("SELECT username FROM accounts ORDER BY created_at, id")]
        self.assertEqual(run["report"]["method"], "naive")
        self.assertEqual((run["created_at"].astimezone(timezone.utc).hour, run["created_at"].tzinfo is not None), (8, True))
        self.assertIs(request["approved_in_advance"], True)
        self.assertEqual(agents.load_attachment(request["attachment"]).name, "sales.csv")
        self.assertEqual((ticket["attachment"]["name"], ticket["message_id"]), ("sales.csv", 9))
        self.assertEqual(order, ["rafa", "second"])
        self.assertNotIn("hello", output)

    def test_second_apply_refuses_unless_replace(self):
        self.assertEqual(self.run_script("--apply")[0], 0)
        accounts.add_message(self.account_id, "user", "written after the copy")
        status, output = self.run_script("--apply")
        self.assertIsInstance(status, SystemExit)
        self.assertIn("already holds rows", str(status))
        self.assertEqual(self.counts()["messages"], 3)
        status, output = self.run_script("--apply", "--replace")
        self.assertEqual(status, 0, output)
        self.assertEqual(self.counts()["messages"], 2)

    def test_count_mismatch_is_reported_as_failure(self):
        original = copy_script.copy_tables

        def drop_one(source, target):
            original(source, target)
            target.execute("DELETE FROM login_failures")

        copy_script.copy_tables = drop_one
        self.addCleanup(setattr, copy_script, "copy_tables", original)
        status, output = self.run_script("--apply")
        self.assertEqual(status, 1)
        self.assertIn("Row counts differ for: login_failures", output)

    def test_missing_file_is_a_clear_error(self):
        status, _ = self.run_script("--source", str(self.source.parent / "missing.sqlite3"))
        self.assertIsInstance(status, SystemExit)
        self.assertIn("No SQLite file", str(status))
