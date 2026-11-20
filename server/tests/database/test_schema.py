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
        self.assertEqual([row["version_num"] for row in version], ["0005_a2a_acp_tools"])
        self.assertTrue({"accounts", "sessions", "messages", "login_failures", "agent_settings", "agent_map_positions",
                         "forecast_runs", "agent_tickets", "agent_requests", "workspaces", "workspace_members",
                         "projects", "project_members", "onboarding", "orchestrator_messages",
                         "assistant_tickets", "project_proposals", "agent_links", "client_keys"} <= tables)

    def test_saved_delegations_become_links(self):
        """0005 copies each project's Operator delegation into its link to Forecasting."""
        database.downgrade(database.DATABASE_URL, self.schema, "0004_entry_experience")
        with database.database() as db:
            db.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id) VALUES ('a1', 'one', 's', 'h', 'c1')")
            db.execute("INSERT INTO workspaces (id, owner_account_id) VALUES ('w1', 'a1')")
            for project, delegation in (("p1", "auto"), ("p2", None)):
                db.execute("INSERT INTO projects (id, workspace_id, conversation_id) VALUES (%s, 'w1', %s)", (project, "c-" + project))
                db.execute("INSERT INTO agent_settings (project_id, agent_id, prompt, data, tools, revision, delegation) VALUES (%s, 'operator', '', '', '[]'::jsonb, 1, %s)",
                           (project, delegation))
        database.migrate()
        with database.database() as db:
            links = db.execute("SELECT project_id, from_agent, to_agent, mode FROM agent_links ORDER BY project_id").fetchall()
            toolsets = db.execute("SELECT runtime_toolsets FROM agent_settings WHERE project_id = 'p1'").fetchone()["runtime_toolsets"]
        # A project that never chose keeps the default from the agent file: no row.
        self.assertEqual([tuple(row.values()) for row in links], [("p1", "operator", "forecasting", "auto")])
        self.assertEqual(toolsets, [])

    def test_foreign_keys_and_identity_columns(self):
        with database.database() as db:
            db.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id) VALUES ('a1', 'one', 's', 'h', 'c1')")
            db.execute("INSERT INTO workspaces (id, owner_account_id) VALUES ('w1', 'a1')")
            db.execute("INSERT INTO projects (id, workspace_id, conversation_id) VALUES ('p1', 'w1', 'pc1')")
            first = db.execute("INSERT INTO messages (project_id, role, text) VALUES ('p1', 'user', 'x') RETURNING id, agent_id").fetchone()
            second = db.execute("INSERT INTO messages (project_id, role, text) VALUES ('p1', 'user', 'y') RETURNING id").fetchone()
        self.assertEqual(first["agent_id"], "operator")
        self.assertGreater(second["id"], first["id"])
        with self.assertRaises(psycopg.errors.ForeignKeyViolation):
            with database.database() as db:
                db.execute("INSERT INTO sessions (token_hash, account_id, expires) VALUES ('t', %s, 1)", (str(uuid4()),))
        # Project data needs a real project.
        with self.assertRaises(psycopg.errors.ForeignKeyViolation):
            with database.database() as db:
                db.execute("INSERT INTO messages (project_id, role, text) VALUES (%s, 'user', 'z')", (str(uuid4()),))
        with self.assertRaises(database.UniqueViolation):
            with database.database() as db:
                db.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id) VALUES ('a2', 'one', 's', 'h', 'c2')")

    def test_each_test_schema_is_isolated(self):
        with database.database() as db:
            schema = db.execute("SELECT current_schema() AS s").fetchone()["s"]
            rows = db.execute("SELECT count(*) AS n FROM accounts").fetchone()["n"]
        self.assertEqual(schema, self.schema)
        self.assertEqual(rows, 0)
