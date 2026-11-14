import unittest
from uuid import uuid4

import psycopg

from src.common import database
from tests.support.database_fixture import DatabaseFixture


class SchemaTests(DatabaseFixture, unittest.TestCase):
    def test_migrations_are_idempotent_and_recorded(self):
        database.migrate()
        database.migrate()
        with database.database() as db:
            version = db.execute("SELECT version_num FROM alembic_version").fetchall()
            tables = {row["table_name"] for row in db.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = %s", (self.schema,))}
        self.assertEqual([row["version_num"] for row in version], ["0001_initial"])
        self.assertTrue({"accounts", "sessions", "messages", "login_failures", "agent_settings", "agent_map_positions",
                         "forecast_runs", "agent_tickets", "agent_requests"} <= tables)

    def test_foreign_keys_and_identity_columns(self):
        with database.database() as db:
            db.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id) VALUES ('a1', 'one', 's', 'h', 'c1')")
            first = db.execute("INSERT INTO messages (account_id, role, text) VALUES ('a1', 'user', 'x') RETURNING id, agent_id").fetchone()
            second = db.execute("INSERT INTO messages (account_id, role, text) VALUES ('a1', 'user', 'y') RETURNING id").fetchone()
        self.assertEqual(first["agent_id"], "operator")
        self.assertGreater(second["id"], first["id"])
        with self.assertRaises(psycopg.errors.ForeignKeyViolation):
            with database.database() as db:
                db.execute("INSERT INTO sessions (token_hash, account_id, expires) VALUES ('t', %s, 1)", (str(uuid4()),))
        with self.assertRaises(database.UniqueViolation):
            with database.database() as db:
                db.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id) VALUES ('a2', 'one', 's', 'h', 'c2')")

    def test_each_test_schema_is_isolated(self):
        with database.database() as db:
            schema = db.execute("SELECT current_schema() AS s").fetchone()["s"]
            rows = db.execute("SELECT count(*) AS n FROM accounts").fetchone()["n"]
        self.assertEqual(schema, self.schema)
        self.assertEqual(rows, 0)
