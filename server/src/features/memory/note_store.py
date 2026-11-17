"""Reads and writes of notes inside an account's memory store (`store.open_store`).

The vault's files are the source of truth (vault.py). The history tables (`notes`,
`note_versions`) only ever gain rows. The index tables are rebuilt for one note from its newest
version whenever that changes, and `vault_files` records which file each note is; see store.py.
"""
import json
import sqlite3

from fastapi import HTTPException

from . import notes, store


def create(db, actor):
    return db.execute("INSERT INTO notes(actor, created_at) VALUES (?, ?)", (actor, store.now())).lastrowid


def note(db, note_id):
    return db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()


def latest(db, note_id):
    """The newest version row, or None for an unknown note."""
    return db.execute("SELECT * FROM note_versions WHERE note_id = ? ORDER BY version DESC LIMIT 1", (note_id,)).fetchone()


def version_count(db, note_id):
    return db.execute("SELECT COUNT(*) FROM note_versions WHERE note_id = ?", (note_id,)).fetchone()[0]


def add_version(db, note_id, parsed, actor):
    previous = latest(db, note_id)
    version = 1
    if previous is not None:
        version = previous["version"] + 1
    created_at = store.now()
    db.execute('''INSERT INTO note_versions(note_id, version, folder, title, frontmatter, body, text, actor, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
               (note_id, version, parsed["folder"], parsed["title"], json.dumps(parsed["frontmatter"], ensure_ascii=False),
                parsed["body"], parsed["text"], actor, created_at))
    return version, created_at


def commit(db, note_id, parsed, actor, action):
    """Add one version (creating the note when `note_id` is None), reindex it and audit it with a
    hash of the text, never the text. Callers check paths and base versions first."""
    if note_id is None:
        note_id = create(db, actor)
    version, updated_at = add_version(db, note_id, parsed, actor)
    reindex(db, note_id, parsed, version, updated_at)
    store.record(db, action, None, actor, note_id=note_id, version=version, text_hash=store.digest(parsed["text"]))
    return note_id, version


def unindex(db, note_id):
    for table in ("note_index", "note_aliases", "note_links", "note_tags"):
        db.execute(f"DELETE FROM {table} WHERE note_id = ?", (note_id,))
    db.execute("DELETE FROM notes_fts WHERE rowid = ?", (note_id,))


def reindex(db, note_id, parsed, version, updated_at):
    """Replace this note's index rows with the ones for its newest version."""
    unindex(db, note_id)
    try:
        db.execute('''INSERT INTO note_index(note_id, version, folder, title, title_key, path_key, essential, updated_at, warning)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                   (note_id, version, parsed["folder"], parsed["title"], notes.key(parsed["title"]),
                    notes.key(parsed["path"]), int(parsed["essential"]), updated_at, parsed.get("warning")))
    except sqlite3.IntegrityError as error:
        # The pipeline checks first; this is the database's own guarantee against a race.
        raise HTTPException(409, "Another note already has this path.") from error
    for alias in parsed["aliases"]:
        db.execute("INSERT INTO note_aliases(note_id, alias, alias_key) VALUES (?, ?, ?)", (note_id, alias, notes.key(alias)))
    for target, alias, context in parsed["links"]:
        db.execute("INSERT INTO note_links(note_id, target, target_key, alias, context) VALUES (?, ?, ?, ?, ?)",
                   (note_id, target, notes.key(target), alias, context))
    for tag in parsed["tags"]:
        db.execute("INSERT INTO note_tags(note_id, tag, tag_key) VALUES (?, ?, ?)", (note_id, tag, notes.key(tag)))
    db.execute("INSERT INTO notes_fts(rowid, title, body) VALUES (?, ?, ?)", (note_id, parsed["title"], parsed["body"]))


def path_owner(db, path):
    """The active note at this folder/title path (compared without case), if any."""
    row = db.execute("SELECT note_id FROM note_index WHERE path_key = ?", (notes.key(path),)).fetchone()
    if row is None:
        return None
    return row["note_id"]


def title_owner(db, title):
    """An active note with this title in any folder, if any."""
    row = db.execute("SELECT note_id FROM note_index WHERE title_key = ? ORDER BY note_id LIMIT 1", (notes.key(title),)).fetchone()
    if row is None:
        return None
    return row["note_id"]


def text_of(version):
    """A version's full text: exact for vault versions, rebuilt from its parts for older ones."""
    if version["text"] is not None:
        return version["text"]
    return notes.render_frontmatter(json.loads(version["frontmatter"])) + version["body"]


def vault_files(db):
    return {row["path"]: dict(row) for row in db.execute("SELECT * FROM vault_files")}


def file_of(db, note_id):
    return db.execute("SELECT * FROM vault_files WHERE note_id = ?", (note_id,)).fetchone()


def set_file(db, note_id, path, size, mtime_ns, sha256):
    db.execute("DELETE FROM vault_files WHERE note_id = ? OR path = ?", (note_id, path))
    db.execute("INSERT INTO vault_files(note_id, path, size, mtime_ns, sha256) VALUES (?, ?, ?, ?, ?)",
               (note_id, path, size, mtime_ns, sha256))


def forget_file(db, note_id):
    db.execute("DELETE FROM vault_files WHERE note_id = ?", (note_id,))


def archive(db, note_id):
    changed = db.execute("UPDATE notes SET archived_at = ? WHERE id = ? AND archived_at IS NULL", (store.now(), note_id)).rowcount
    if changed != 1:
        raise HTTPException(409, "This note was already archived.")
    unindex(db, note_id)
    forget_file(db, note_id)


def index_rows(db):
    return [dict(row) for row in db.execute("SELECT * FROM note_index ORDER BY folder, title")]


def active_ids(db):
    return [row["note_id"] for row in db.execute("SELECT note_id FROM note_index")]


def links(db):
    return [dict(row) for row in db.execute("SELECT * FROM note_links ORDER BY note_id, rowid")]


def aliases(db):
    return [dict(row) for row in db.execute("SELECT * FROM note_aliases ORDER BY note_id")]


def tags(db):
    return [dict(row) for row in db.execute("SELECT * FROM note_tags ORDER BY note_id")]


def search(db, question, limit=8):
    """Active notes matching the question's keywords, best first, with a short snippet."""
    terms = store.search_terms(question)
    if not terms:
        return []
    expression = " OR ".join('"' + word.replace('"', '""') + '"' for word in terms)
    found = db.execute('''SELECT note_index.note_id, note_index.title, note_index.folder,
            snippet(notes_fts, 1, '', '', '…', 16) AS snippet
        FROM notes_fts JOIN note_index ON note_index.note_id = notes_fts.rowid
        WHERE notes_fts MATCH ? ORDER BY bm25(notes_fts, 5.0, 1.0) LIMIT ?''', (expression, limit))
    return [dict(row) for row in found]
