"""A throwaway PostgreSQL schema per test, so tests never touch the development database.

`MULA_TEST_DATABASE_URL` names the test database (default: `mula_test` on localhost). Each
test creates `test_<random>` inside it, runs the migrations there, and drops it on cleanup.
There is no SQLite fallback: the application only runs on PostgreSQL, so the tests do too.
"""
import os
from pathlib import Path
import secrets
import tempfile
from unittest.mock import patch

import psycopg

from src.common import database
from src.features.memory import store

TEST_DATABASE_URL = os.environ.get("MULA_TEST_DATABASE_URL", "postgresql://localhost/mula_test")
HOW_TO_START = (
    "The test database is not reachable at MULA_TEST_DATABASE_URL (default postgresql://localhost/mula_test). "
    "Start PostgreSQL and create it: `createdb mula_test` (Homebrew) or `docker compose up -d postgres` "
    "followed by `createdb -h localhost -U mula mula_test`. See server/README.md, 'Database'."
)


def admin_connection():
    try:
        return psycopg.connect(TEST_DATABASE_URL, autocommit=True, connect_timeout=5)
    except psycopg.OperationalError as error:
        raise RuntimeError(HOW_TO_START) from error


def quoted(name):
    return '"' + name.replace('"', '""') + '"'


class DatabaseFixture:
    """Mix into a TestCase (before unittest.TestCase). setUp creates the schema and a data folder."""

    def setUp(self):
        self.schema = "test_" + secrets.token_hex(6)
        admin = admin_connection()
        admin.execute(f"CREATE SCHEMA {quoted(self.schema)}")
        previous = (database.DATABASE_URL, database.SCHEMA)

        def drop_schema():
            # Point the process back where it was, so no later test reaches a dropped schema.
            database.configure(*previous)
            admin.execute(f"DROP SCHEMA {quoted(self.schema)} CASCADE")
            admin.close()

        self.addCleanup(drop_schema)
        database.configure(TEST_DATABASE_URL, self.schema)
        database.migrate()
        # Per-account files (memory stores) go to a private folder, never the developer's .runtime.
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.data_dir = Path(temporary.name)
        data_dir = patch.object(store, "DATA_DIR", self.data_dir)
        data_dir.start()
        self.addCleanup(data_dir.stop)
