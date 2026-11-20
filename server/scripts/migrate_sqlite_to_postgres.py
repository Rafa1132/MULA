"""Copy Mula's application data from the old SQLite file into PostgreSQL. Dry run by default.

    server/.venv/bin/python server/scripts/migrate_sqlite_to_postgres.py            # report counts
    server/.venv/bin/python server/scripts/migrate_sqlite_to_postgres.py --apply    # copy
    server/.venv/bin/python server/scripts/migrate_sqlite_to_postgres.py --apply --replace   # copy again over existing rows

The SQLite file (default `.runtime/accounts.sqlite3`, or `--source`) is opened read-only and is
never moved, renamed or changed; it stays as the rollback copy. The target is `MULA_DATABASE_URL`
from the environment or `server/.env.hermes` (or `--database-url`), schema `MULA_DATABASE_SCHEMA`
or `--schema` (default `public`).

With --apply the script brings the schema to the latest migration, refuses to write into tables
that already hold rows unless --replace empties them first, copies every table inside one
transaction in foreign-key order with `messages.id` preserved, and then counts the rows on both
sides. A count that differs ends with exit status 1. The legacy memory tables left in the file
by the old memory service (`memory_documents`, `memory_chunks`, `memory_changes`,
`memory_retrievals`) are reported and not copied: nothing reads them any more. Only counts are
printed, never rows.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from src.common import database, profiles  # noqa: E402
from src.common.database import Jsonb  # noqa: E402

DEFAULT_SOURCE = BACKEND.parent / ".runtime" / "accounts.sqlite3"
# Foreign-key order: accounts first, then everything that points at it.
TABLES = ("accounts", "sessions", "messages", "login_failures", "agent_settings", "agent_map_positions",
          "forecast_runs", "agent_tickets", "agent_requests")
LEGACY_TABLES = ("memory_documents", "memory_chunks", "memory_changes", "memory_retrievals")


# The revision whose tables match the SQLite file; see main().
FIRST_REVISION = "0001_initial"
# Tables later revisions add; emptied with the rest by --replace.
LATER_TABLES = ("project_members", "projects", "workspace_members", "workspaces")


def schema_revision(url, schema):
    """The schema's Alembic revision, or None for a schema that was never migrated."""
    with database.connect(url, schema) as connection:
        if connection.execute("SELECT to_regclass('alembic_version') AS name").fetchone()["name"] is None:
            return None
        row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    if row is None:
        return None
    return row["version_num"]


def prepare_first_revision(url, schema, replace):
    """Bring the target to FIRST_REVISION. A schema already past it may only be emptied and taken
    back with --replace (or when it holds no rows), so no copied data is ever mixed with newer data."""
    revision = schema_revision(url, schema)
    if revision in (None, FIRST_REVISION):
        database.migrate(url, schema, FIRST_REVISION)
        return
    with database.connect(url, schema) as target:
        with target.transaction():
            if any(target_counts(target).values()) and not replace:
                raise SystemExit("The target already holds rows. Add --replace to empty the application tables and copy again, or point --schema elsewhere.")
            target.execute("TRUNCATE " + ", ".join(TABLES + LATER_TABLES) + " RESTART IDENTITY CASCADE")
    database.downgrade(url, schema, FIRST_REVISION)

def open_source(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise SystemExit(f"No SQLite file at {path}. Nothing to copy.")
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def file_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def table_exists(source: sqlite3.Connection, table: str) -> bool:
    row = source.execute("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?", (table,)).fetchone()
    return row is not None


def source_rows(source: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    """All rows of a table in insertion order; an older file may lack the table entirely."""
    if not table_exists(source, table):
        return []
    return source.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()


def source_counts(source: sqlite3.Connection) -> dict[str, int]:
    counts = {}
    for table in TABLES + LEGACY_TABLES:
        if table_exists(source, table):
            counts[table] = source.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        else:
            counts[table] = 0
    return counts


def target_counts(connection) -> dict[str, int]:
    counts = {}
    for table in TABLES:
        counts[table] = connection.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"]
    return counts


def value(row: sqlite3.Row, column: str, default=None):
    """A column that may be missing from an older file."""
    if column in row.keys():
        return row[column]
    return default


def json_or_none(text):
    if text is None:
        return None
    return Jsonb(json.loads(text))


def utc_timestamp(text, fallback: datetime) -> datetime:
    """SQLite's CURRENT_TIMESTAMP wrote naive UTC text ('YYYY-MM-DD HH:MM:SS')."""
    if not text:
        return fallback
    try:
        parsed = datetime.fromisoformat(str(text))
    except ValueError:
        return fallback
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def copy_tables(source: sqlite3.Connection, target) -> None:
    """Insert every table's rows into `target` (an open transaction). Order and ids are kept."""
    base = datetime.now(timezone.utc)
    for index, row in enumerate(source_rows(source, "accounts")):
        # SQLite ordered accounts by rowid; created_at keeps that order one microsecond apart.
        target.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
                       (row["id"], row["username"], row["salt"], row["password_hash"], row["conversation_id"], base + timedelta(microseconds=index)))
    for row in source_rows(source, "sessions"):
        target.execute("INSERT INTO sessions (token_hash, account_id, expires) VALUES (%s, %s, %s)", (row["token_hash"], row["account_id"], row["expires"]))
    for row in source_rows(source, "messages"):
        target.execute("INSERT INTO messages (id, account_id, role, text, note, agent_id) OVERRIDING SYSTEM VALUE VALUES (%s, %s, %s, %s, %s, %s)",
                       (row["id"], row["account_id"], row["role"], row["text"], row["note"], value(row, "agent_id", "operator")))
    target.execute("SELECT setval(pg_get_serial_sequence('messages', 'id'), COALESCE((SELECT max(id) FROM messages), 0) + 1, false)")
    for row in source_rows(source, "login_failures"):
        target.execute("INSERT INTO login_failures (username, occurred) VALUES (%s, %s)", (row["username"], row["occurred"]))
    for row in source_rows(source, "agent_settings"):
        target.execute("INSERT INTO agent_settings (account_id, agent_id, prompt, data, tools, revision, brain, delegation) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                       (row["account_id"], row["agent_id"], row["prompt"], row["data"], json_or_none(row["tools"]), row["revision"],
                        value(row, "brain"), value(row, "delegation")))
    for row in source_rows(source, "agent_map_positions"):
        target.execute("INSERT INTO agent_map_positions (account_id, agent_id, x, y) VALUES (%s, %s, %s, %s)", (row["account_id"], row["agent_id"], row["x"], row["y"]))
    for index, row in enumerate(source_rows(source, "forecast_runs")):
        target.execute("INSERT INTO forecast_runs (id, account_id, report, explanation, created_at) VALUES (%s, %s, %s, %s, %s)",
                       (row["id"], row["account_id"], json_or_none(row["report"]), row["explanation"],
                        utc_timestamp(value(row, "created_at"), base + timedelta(microseconds=index))))
    for row in source_rows(source, "agent_tickets"):
        target.execute("INSERT INTO agent_tickets (token_hash, account_id, agent_id, attachment, message_id, depth, expires) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                       (row["token_hash"], row["account_id"], row["agent_id"], json_or_none(row["attachment"]), row["message_id"], row["depth"], row["expires"]))
    for row in source_rows(source, "agent_requests"):
        target.execute('''INSERT INTO agent_requests (id, account_id, from_agent, to_agent, question, attachment, ticket_hash, message_id, status, answer, created, approved_in_advance)
                          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                       (row["id"], row["account_id"], row["from_agent"], row["to_agent"], row["question"], json_or_none(row["attachment"]),
                        row["ticket_hash"], row["message_id"], row["status"], row["answer"], row["created"], bool(value(row, "approved_in_advance", 0))))


def resolve_database_url(explicit: str | None) -> str:
    if explicit:
        return explicit
    url = os.environ.get("MULA_DATABASE_URL", "").strip() or profiles.env_values(BACKEND / ".env.hermes").get("MULA_DATABASE_URL", "")
    if not url:
        raise SystemExit("MULA_DATABASE_URL is missing from server/.env.hermes. See server/README.md, 'Database'.")
    return url


def report(label: str, counts: dict[str, int]) -> None:
    print(label)
    for table, count in counts.items():
        print(f"  {table}: {count}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="The SQLite file to read (never modified).")
    parser.add_argument("--database-url", help="Target PostgreSQL URL; default MULA_DATABASE_URL.")
    parser.add_argument("--schema", default=os.environ.get("MULA_DATABASE_SCHEMA", "").strip() or "public")
    parser.add_argument("--apply", action="store_true", help="Copy the rows. Without it, only report counts.")
    parser.add_argument("--replace", action="store_true", help="With --apply: empty the application tables first.")
    arguments = parser.parse_args(argv)
    url = resolve_database_url(arguments.database_url)
    # open_source refuses a missing file, so the digest is always taken from a real file.
    source = open_source(arguments.source)
    before = file_digest(arguments.source)
    try:
        counts = source_counts(source)
        report(f"Source {arguments.source}:", {table: counts[table] for table in TABLES})
        legacy = {table: counts[table] for table in LEGACY_TABLES if counts[table]}
        if legacy:
            report("Legacy memory tables, not copied (nothing reads them):", legacy)
        if not arguments.apply:
            print("Dry run; nothing was written. Add --apply to copy.")
            return 0
        # The SQLite file has the schema of the first revision (one account = one business), so
        # the rows go into that revision; the later ones then turn each account into a project.
        prepare_first_revision(url, arguments.schema, arguments.replace)
        with database.connect(url, arguments.schema) as target:
            with target.transaction():
                existing = target_counts(target)
                if any(existing.values()):
                    if not arguments.replace:
                        raise SystemExit("The target already holds rows. Add --replace to empty the application tables and copy again, or point --schema elsewhere.")
                    target.execute("TRUNCATE " + ", ".join(TABLES) + " RESTART IDENTITY CASCADE")
                copy_tables(source, target)
            after = target_counts(target)
        database.migrate(url, arguments.schema)
    finally:
        source.close()
    report("Target after copy:", after)
    if file_digest(arguments.source) != before:
        print("The source file changed during the copy; check it and run again.")
        return 1
    mismatched = [table for table in TABLES if counts[table] != after[table]]
    if mismatched:
        print("Row counts differ for: " + ", ".join(mismatched) + ". Rerun with --apply --replace after checking the file.")
        return 1
    print("Copied. The SQLite file was left unchanged as the rollback copy. Restart Mula: ./run.sh")
    return 0


if __name__ == "__main__":
    sys.exit(main())
