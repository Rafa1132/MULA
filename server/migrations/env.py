"""Alembic environment for Mula's application database.

The database URL and schema come from `src.common.database.migrate()` (programmatic use, the
normal path) or from `MULA_DATABASE_URL` / `MULA_DATABASE_SCHEMA` when the `alembic` command is
run by hand from the `server/` folder. Revisions are plain SQL; SQLAlchemy is only the engine
Alembic drives.
"""
import os

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

config = context.config
URL = config.attributes.get("url") or os.environ.get("MULA_DATABASE_URL", "")
SCHEMA = config.attributes.get("schema") or os.environ.get("MULA_DATABASE_SCHEMA", "public") or "public"
if not URL:
    raise SystemExit("MULA_DATABASE_URL is not set; see server/README.md, 'Database'.")


def sqlalchemy_url(url: str) -> str:
    """The same database through SQLAlchemy's psycopg 3 dialect."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def quoted(schema: str) -> str:
    return '"' + schema.replace('"', '""') + '"'


def run_migrations_online() -> None:
    engine = create_engine(sqlalchemy_url(URL), connect_args={"options": f"-c search_path={quoted(SCHEMA)}"},
                           poolclass=NullPool)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, version_table_schema=SCHEMA, transaction_per_migration=True)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline migrations are not supported; run against a database.")
run_migrations_online()
