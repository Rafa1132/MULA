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
