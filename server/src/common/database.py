"""The application database: one PostgreSQL pool, one transaction per use, Alembic for the schema.

Every feature opens the database the same way:

    with database() as db:
        db.execute("SELECT ... WHERE id = %s", (value,))

The block is one transaction: it commits when the block ends normally and rolls back on an
exception, which is what the SQLite `with connection:` block used to do. Rows come back as
dicts. The schema is created and upgraded only by the Alembic revisions under
server/migrations; nothing creates tables on the fly.

`MULA_DATABASE_URL` names the database (`postgresql://user:password@host:5432/mula`); the
password never leaves the environment file. `MULA_DATABASE_SCHEMA` (default `public`) lets
tests and rehearsals run in a schema of their own on the same server.
"""
from contextlib import contextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
import psycopg
from psycopg.errors import UniqueViolation  # noqa: F401  (re-exported for callers)
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb  # noqa: F401  (re-exported for callers)
from psycopg_pool import ConnectionPool

from .config import MULA_DATABASE_SCHEMA, MULA_DATABASE_URL

BACKEND = Path(__file__).resolve().parents[2]
MIGRATIONS = BACKEND / "migrations"
POOL_SIZE = 10
CONNECT_TIMEOUT_SECONDS = 10

DATABASE_URL = MULA_DATABASE_URL
SCHEMA = MULA_DATABASE_SCHEMA
_pool = None


class DatabaseNotConfigured(RuntimeError):
    """MULA_DATABASE_URL is missing; the message says how to fix it."""


def connection_options(schema: str) -> str:
    """libpq options that pin every connection to one schema."""
    return f"-c search_path={quote_identifier(schema)}"


def quote_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def configure(url: str, schema: str = "public") -> None:
    """Point this process at another database or schema (tests, scripts). Closes the open pool."""
    global DATABASE_URL, SCHEMA
    close()
    DATABASE_URL = url
    SCHEMA = schema


def close() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise DatabaseNotConfigured(
                "MULA_DATABASE_URL is not set. Add it to server/.env.hermes (see server/README.md, 'Database')."
            )
        _pool = ConnectionPool(
            DATABASE_URL, min_size=0, max_size=POOL_SIZE, open=True, timeout=CONNECT_TIMEOUT_SECONDS, name="mula",
            kwargs={"row_factory": dict_row, "options": connection_options(SCHEMA)},
        )
    return _pool


@contextmanager
def database():
    """One connection from the pool, inside one transaction; rows are dicts."""
    with pool().connection() as connection:
        with connection.transaction():
            yield connection


def connect(url: str | None = None, schema: str | None = None, autocommit: bool = False) -> psycopg.Connection:
    """A standalone connection outside the pool, for migrations and scripts."""
    if url is None:
        url = DATABASE_URL
    if schema is None:
        schema = SCHEMA
    if not url:
        raise DatabaseNotConfigured("MULA_DATABASE_URL is not set.")
    return psycopg.connect(url, row_factory=dict_row, options=connection_options(schema), autocommit=autocommit,
                           connect_timeout=CONNECT_TIMEOUT_SECONDS)


def migrate(url: str | None = None, schema: str | None = None) -> None:
    """Bring the schema to the latest Alembic revision. Idempotent."""
    if url is None:
        url = DATABASE_URL
    if schema is None:
        schema = SCHEMA
    if not url:
        raise DatabaseNotConfigured(
            "MULA_DATABASE_URL is not set. Add it to server/.env.hermes (see server/README.md, 'Database')."
        )
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    config.attributes["url"] = url
    config.attributes["schema"] = schema
    command.upgrade(config, "head")


def reachable(url: str | None = None) -> bool:
    """Whether the server answers at all; used by the launcher and the readiness message."""
    try:
        with connect(url, "public", autocommit=True) as connection:
            connection.execute("SELECT 1")
    except (psycopg.Error, DatabaseNotConfigured):
        return False
    return True
