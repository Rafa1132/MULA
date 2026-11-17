"""The append-only memory store: one SQLite file per account.

Every fact is a row in `entries`. Rows are never edited or deleted; a correction adds
a new row and marks the old one superseded, and a retirement marks it superseded with
no replacement. Triggers enforce that in the database itself, so no code path, not
even a bug, can rewrite history. Every write lands in `audit` with hashes and ids only.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
from uuid import UUID

from fastapi import HTTPException

from ...common.config import MULA_DATA_DIR
from ...common.paths import PROJECT_ROOT

# Per-account files live here, under workspaces/<account>/memory/. The application database is elsewhere.
DATA_DIR = PROJECT_ROOT / ".runtime"
if MULA_DATA_DIR:
    DATA_DIR = Path(MULA_DATA_DIR)
TARGETS = ("business", "owner")
STOP_WORDS = set("a an the is are was to of and or for in on my me i you your what how can please with about this that it do does tell remember ingat saya aku yang dan di ke dari apa bagaimana untuk ini itu bisa tolong".split())
SCHEMA = '''
    CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY,
        target TEXT NOT NULL CHECK (target IN ('business', 'owner')),
        fact TEXT NOT NULL,
        normalized TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL,
        origin_message_id INTEGER,
        superseded_by INTEGER REFERENCES entries(id),
        superseded_at TEXT,
        superseded_reason TEXT CHECK (superseded_reason IN ('replaced', 'retired'))
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
        fact, content='entries', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS entries_index AFTER INSERT ON entries BEGIN
        INSERT INTO entries_fts(rowid, fact) VALUES (new.id, new.fact);
    END;
    CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY, action TEXT NOT NULL, entry_id INTEGER, actor TEXT NOT NULL,
        occurred_at TEXT NOT NULL, detail TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS retrievals (
        id INTEGER PRIMARY KEY CHECK (id = 1), question TEXT NOT NULL, occurred_at TEXT NOT NULL, entry_ids TEXT NOT NULL
    );
    -- Append-only guarantees, enforced by the database rather than by callers.
    CREATE TRIGGER IF NOT EXISTS entries_no_delete BEFORE DELETE ON entries BEGIN
        SELECT RAISE(ABORT, 'memory entries are append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS entries_no_rewrite BEFORE UPDATE OF id, target, fact, normalized, actor, created_at, origin_message_id ON entries BEGIN
        SELECT RAISE(ABORT, 'memory entries are append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS entries_supersede_once BEFORE UPDATE OF superseded_by, superseded_at, superseded_reason ON entries
    WHEN old.superseded_at IS NOT NULL OR new.superseded_at IS NULL OR new.superseded_reason IS NULL BEGIN
        SELECT RAISE(ABORT, 'memory entries can be superseded only once');
    END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN
        SELECT RAISE(ABORT, 'the memory audit log is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN
        SELECT RAISE(ABORT, 'the memory audit log is append-only');
    END;

    -- Notes. The vault's Markdown files are the source of truth (vault.py); `notes` and
    -- `note_versions` are their history and are append-only like `entries`: every change Mula
    -- sees or makes is a new version, and a note can be archived once but never deleted.
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL,
        archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS note_versions (
        id INTEGER PRIMARY KEY,
        note_id INTEGER NOT NULL REFERENCES notes(id),
        version INTEGER NOT NULL,
        folder TEXT NOT NULL,
        title TEXT NOT NULL,
        frontmatter TEXT NOT NULL,
        body TEXT NOT NULL,
        -- The file's exact text for versions read from or written to the vault; older versions have none.
        text TEXT,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (note_id, version)
    );
    CREATE TRIGGER IF NOT EXISTS notes_no_delete BEFORE DELETE ON notes BEGIN
        SELECT RAISE(ABORT, 'notes are append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS notes_no_rewrite BEFORE UPDATE OF id, actor, created_at ON notes BEGIN
        SELECT RAISE(ABORT, 'notes are append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS notes_archive_once BEFORE UPDATE OF archived_at ON notes
    WHEN old.archived_at IS NOT NULL OR new.archived_at IS NULL BEGIN
        SELECT RAISE(ABORT, 'a note can be archived only once');
    END;
    CREATE TRIGGER IF NOT EXISTS note_versions_no_delete BEFORE DELETE ON note_versions BEGIN
        SELECT RAISE(ABORT, 'note versions are append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS note_versions_no_update BEFORE UPDATE ON note_versions BEGIN
        SELECT RAISE(ABORT, 'note versions are append-only');
    END;

    -- The index: derived from each active note's latest version and rebuilt for that note on every
    -- save, so it is the one deliberate exception to append-only. It never holds anything the
    -- versions don't, and an archived note leaves it.
    -- Titles may repeat across folders, as in Obsidian; a path may not.
    CREATE TABLE IF NOT EXISTS note_index (
        note_id INTEGER PRIMARY KEY REFERENCES notes(id),
        version INTEGER NOT NULL,
        folder TEXT NOT NULL,
        title TEXT NOT NULL,
        title_key TEXT NOT NULL,
        path_key TEXT NOT NULL UNIQUE,
        essential INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        warning TEXT
    );
    CREATE INDEX IF NOT EXISTS note_index_title ON note_index(title_key);
    -- Which vault file each active note is, and what it looked like when last read, so a scan
    -- re-reads only files whose size or modified time changed. Bookkeeping, rewritten freely.
    CREATE TABLE IF NOT EXISTS vault_files (
        note_id INTEGER PRIMARY KEY REFERENCES notes(id),
        path TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        mtime_ns INTEGER NOT NULL,
        sha256 TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_aliases (
        note_id INTEGER NOT NULL REFERENCES notes(id), alias TEXT NOT NULL, alias_key TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_links (
        note_id INTEGER NOT NULL REFERENCES notes(id), target TEXT NOT NULL, target_key TEXT NOT NULL,
        alias TEXT, context TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_tags (
        note_id INTEGER NOT NULL REFERENCES notes(id), tag TEXT NOT NULL, tag_key TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS note_links_target ON note_links(target_key);
    CREATE INDEX IF NOT EXISTS note_links_note ON note_links(note_id);
    CREATE INDEX IF NOT EXISTS note_aliases_key ON note_aliases(alias_key);
    CREATE INDEX IF NOT EXISTS note_tags_note ON note_tags(note_id);
    -- Separate from entries_fts, so fact retrieval for the Operator ranks exactly as before.
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, body, tokenize='unicode61 remove_diacritics 2');
'''


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def memory_folder(account_id):
    """The account's memory folder, created owner-only. Never a client-supplied path."""
    identity = str(UUID(account_id))
    root = DATA_DIR / "workspaces"
    folder = root / identity / "memory"
    for directory in (root, root / identity, folder):
        if directory.is_symlink():
            raise HTTPException(409, "Memory directories must not be symbolic links.")
        directory.mkdir(mode=0o700, exist_ok=True)
    return folder


def columns(connection, table):
    return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}


def migrate(connection):
    """Bring a store made before the vault became the source of truth up to the current schema.

    `note_versions` gains the nullable `text` column (no rows change). `note_index` is derived, so
    it is rebuilt in place without the old unique title and with the new `warning` column.
    """
    if "text" not in columns(connection, "note_versions"):
        connection.execute("ALTER TABLE note_versions ADD COLUMN text TEXT")
    if "warning" not in columns(connection, "note_index"):
        # One explicit transaction: sqlite3 doesn't open one by itself for schema statements, and
        # executescript would commit on its own.
        connection.execute("BEGIN IMMEDIATE")
        try:
            connection.execute("DROP INDEX IF EXISTS note_index_title")
            connection.execute("ALTER TABLE note_index RENAME TO note_index_old")
            connection.execute("""CREATE TABLE note_index (
                note_id INTEGER PRIMARY KEY REFERENCES notes(id), version INTEGER NOT NULL, folder TEXT NOT NULL,
                title TEXT NOT NULL, title_key TEXT NOT NULL, path_key TEXT NOT NULL UNIQUE, essential INTEGER NOT NULL,
                updated_at TEXT NOT NULL, warning TEXT)""")
            connection.execute("""INSERT INTO note_index(note_id, version, folder, title, title_key, path_key, essential, updated_at)
                SELECT note_id, version, folder, title, title_key, path_key, essential, updated_at FROM note_index_old""")
            connection.execute("DROP TABLE note_index_old")
            connection.execute("CREATE INDEX note_index_title ON note_index(title_key)")
            connection.execute("COMMIT")
        except sqlite3.Error:
            connection.execute("ROLLBACK")
            raise


@contextmanager
def open_store(account_id):
    """The account's store, with the schema in place; one transaction per use."""
    path = memory_folder(account_id) / "store.sqlite3"
    if path.is_symlink():
        raise HTTPException(409, "The memory store must not be a symbolic link.")
    try:
        connection = sqlite3.connect(path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(SCHEMA)
        migrate(connection)
        os.chmod(path, 0o600)
    except (sqlite3.Error, OSError) as error:
        raise HTTPException(503, "The memory store could not be opened. Check the runtime folder's permissions.") from error
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def public(row):
    entry = dict(row)
    entry["superseded"] = entry["superseded_at"] is not None
    return entry


def add_entry(db, target, fact, normalized, actor, origin_message_id=None):
    if target not in TARGETS:
        raise HTTPException(422, "Choose 'business' or 'owner' as the memory target.")
    cursor = db.execute("INSERT INTO entries(target, fact, normalized, actor, created_at, origin_message_id) VALUES (?, ?, ?, ?, ?, ?)",
                        (target, fact, normalized, actor, now(), origin_message_id))
    return cursor.lastrowid


def entry(db, entry_id):
    row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    if row is None:
        return None
    return public(row)


def active_entries(db, target=None):
    if target is None:
        rows = db.execute("SELECT * FROM entries WHERE superseded_at IS NULL ORDER BY id DESC")
    else:
        rows = db.execute("SELECT * FROM entries WHERE superseded_at IS NULL AND target = ? ORDER BY id DESC", (target,))
    return [public(row) for row in rows]


def all_entries(db):
    return [public(row) for row in db.execute("SELECT * FROM entries ORDER BY id DESC")]


def supersede(db, old_id, new_id, reason):
    """Mark `old_id` replaced by `new_id`, or retired when `new_id` is None. Once only."""
    try:
        changed = db.execute("UPDATE entries SET superseded_by = ?, superseded_at = ?, superseded_reason = ? WHERE id = ? AND superseded_at IS NULL",
                             (new_id, now(), reason, old_id)).rowcount
    except sqlite3.IntegrityError as error:
        raise HTTPException(409, "This memory was already corrected or retired.") from error
    if changed != 1:
        raise HTTPException(409, "This memory was already corrected or retired.")


def record(db, action, entry_id, actor, **detail):
    """One audit row. Callers pass ids and hashes only, never fact text."""
    db.execute("INSERT INTO audit(action, entry_id, actor, occurred_at, detail) VALUES (?, ?, ?, ?, ?)",
               (action, entry_id, actor, now(), json.dumps(detail, ensure_ascii=False, sort_keys=True)))


def audit_tail(db, limit=30):
    rows = db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))
    return [{**dict(row), "detail": json.loads(row["detail"])} for row in rows]


def search_terms(question):
    return list(dict.fromkeys(word.lower() for word in re.findall(r"[^\W_]+", question, re.UNICODE)
                              if 1 < len(word) <= 64 and word.lower() not in STOP_WORDS))[:24]


def search(db, question, limit=8, include_superseded=False):
    """Active rows matching the question's keywords, best match first."""
    terms = search_terms(question)
    if not terms:
        return []
    expression = " OR ".join('"' + word.replace('"', '""') + '"' for word in terms)
    condition = ""
    if not include_superseded:
        condition = "AND entries.superseded_at IS NULL"
    rows = db.execute(f'''SELECT entries.* FROM entries_fts JOIN entries ON entries.id = entries_fts.rowid
        WHERE entries_fts MATCH ? {condition} ORDER BY bm25(entries_fts), entries.id DESC LIMIT ?''', (expression, limit))
    return [public(row) for row in rows]


def save_retrieval(db, question, entry_ids):
    db.execute("INSERT OR REPLACE INTO retrievals(id, question, occurred_at, entry_ids) VALUES (1, ?, ?, ?)",
               (question[:1000], now(), json.dumps(entry_ids)))


def last_retrieval(db):
    row = db.execute("SELECT question, occurred_at, entry_ids FROM retrievals WHERE id = 1").fetchone()
    if row is None:
        return None
    ids = json.loads(row["entry_ids"])
    entries = []
    for entry_id in ids:
        found = entry(db, entry_id)
        if found is not None:
            entries.append(found)
    return {"question": row["question"], "occurred_at": row["occurred_at"], "entries": entries}
