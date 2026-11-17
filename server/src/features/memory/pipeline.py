"""The one way anything gets into memory: validate, filter, dedupe, commit, audit, summarise.

The Operator's `remember` tool, the owner's `/remember` command and the Memory page
all call `remember`. Corrections go through `remember(..., replaces=id)`, which adds
the new fact and marks the old one superseded; nothing is ever rewritten.

Notes live as Markdown files in the account's vault (vault.py), which is their source of truth.
Mula's own edits go through `save_note`: scan the vault, validate, filter (line by line), refuse
a stale editor or a name a file already uses, add a version (never rewrite one), audit with a
hash, and write the file.
"""
from fastapi import HTTPException

from . import filters, note_store, notes, store, summary, vault
from .filters import MemoryRefused

ACTORS = ("operator", "owner", "migration")


def remember(account_id, target, fact, actor, origin_message_id=None, replaces=None):
    """Save one fact. Returns {"outcome": saved|duplicate, "entry": row}; raises MemoryRefused."""
    if actor not in ACTORS:
        raise ValueError("Unknown memory actor.")
    if target not in store.TARGETS:
        raise MemoryRefused("Choose 'business' or 'owner' as the memory target.")
    with store.open_store(account_id) as db:
        try:
            text = filters.check(fact)
        except MemoryRefused as refusal:
            # The audit keeps a hash so a refusal is traceable without storing the text.
            store.record(db, "refused", None, actor, target=target, fact_hash=store.digest(" ".join(str(fact).split())), reason=str(refusal))
            # The connection's context manager rolls back on an exception; keep the refusal.
            db.commit()
            raise
        normalized = filters.normalize(text)
        existing = duplicate_of(db, target, normalized)
        if existing is not None and replaces is None:
            store.record(db, "duplicate", existing["id"], actor, target=target, fact_hash=store.digest(text))
            return {"outcome": "duplicate", "entry": existing}
        old = None
        if replaces is not None:
            old = store.entry(db, replaces)
            if old is None or old["superseded"]:
                raise HTTPException(409, "The memory to replace was not found or was already corrected.")
            if old["target"] != target:
                raise HTTPException(422, "A correction must keep the memory's target.")
        entry_id = store.add_entry(db, target, text, normalized, actor, origin_message_id)
        store.record(db, "saved", entry_id, actor, target=target, fact_hash=store.digest(text), origin_message_id=origin_message_id)
        if old is not None:
            store.supersede(db, old["id"], entry_id, "replaced")
            store.record(db, "replaced", old["id"], actor, replaced_by=entry_id)
        saved = store.entry(db, entry_id)
        entries = store.active_entries(db)
    summary.regenerate(account_id, entries)
    return {"outcome": "saved", "entry": saved}


def retire(account_id, entry_id, actor):
    """Mark a fact as no longer true, without a replacement."""
    with store.open_store(account_id) as db:
        existing = store.entry(db, entry_id)
        if existing is None:
            raise HTTPException(404, "This memory was not found.")
        store.supersede(db, entry_id, None, "retired")
        store.record(db, "retired", entry_id, actor)
        entries = store.active_entries(db)
    summary.regenerate(account_id, entries)
    return store_entry(account_id, entry_id)


def store_entry(account_id, entry_id):
    with store.open_store(account_id) as db:
        return store.entry(db, entry_id)


def duplicate_of(db, target, normalized):
    """An active fact that says the same thing, by exact or near-exact wording."""
    for candidate in store.active_entries(db, target):
        if candidate["normalized"] == normalized:
            return candidate
        if filters.similarity(candidate["normalized"], normalized) >= filters.DUPLICATE_THRESHOLD:
            return candidate
    return None


def related_ids(entries):
    """For each active entry, the ids of others in the same target that overlap enough to conflict."""
    related = {}
    for left in entries:
        matches = []
        for right in entries:
            if right["id"] == left["id"] or right["target"] != left["target"]:
                continue
            if filters.similarity(left["normalized"], right["normalized"]) >= filters.RELATED_THRESHOLD:
                matches.append(right["id"])
        related[left["id"]] = matches
    return related


def same_version(previous, parsed):
    return (previous["folder"] == parsed["folder"] and previous["title"] == parsed["title"]
            and note_store.text_of(previous) == parsed["text"])


def moved_keys(previous, parsed):
    """Link keys that pointed at the note before a rename or move and no longer do."""
    before = {notes.key(previous["title"]), notes.key(notes.path_of(previous["folder"], previous["title"]))}
    after = {notes.key(parsed["title"]), notes.key(parsed["path"])}
    return before - after


def stale_link_count(db, keys, note_id):
    """Other notes, and facts, whose links still name the note's old title or path."""
    if not keys:
        return 0, 0
    marks = ",".join("?" for _ in keys)
    linking = db.execute(f"SELECT COUNT(DISTINCT note_id) FROM note_links WHERE target_key IN ({marks}) AND note_id != ?",
                         (*keys, note_id)).fetchone()[0]
    facts = 0
    for entry in store.active_entries(db):
        if any(notes.key(target) in keys for target, _, _ in notes.fact_links(entry["fact"])):
            facts += 1
    return linking, facts


def write_version(db, root, note_id, parsed, actor, action, old_rel):
    """Add the version, then write the file; the transaction commits only if the write worked."""
    note_id, version = note_store.commit(db, note_id, parsed, actor, action)
    new_rel = vault.relative(parsed["folder"], parsed["title"])
    note_store.set_file(db, note_id, new_rel, *vault.write_note(root, old_rel, new_rel, parsed["text"]))
    return note_id, version


def current_file(db, note_id):
    record = note_store.file_of(db, note_id)
    if record is None:
        return None
    return record["path"]


def save_note(account_id, note_id, folder, title, text, actor, base_version=None):
    """Create a note (note_id None) or save a new version of one, writing its file in the vault.
    Returns what changed; raises MemoryRefused.

    The vault is scanned first, so an edit made in Obsidian since the editor opened makes its
    base version stale and the save is refused (409) instead of overwriting it. A new name is
    refused when a file already sits there: Mula never replaces a file it hasn't read.
    """
    if actor not in ACTORS:
        raise ValueError("Unknown memory actor.")
    vault.scan(account_id)
    with vault.lock_for(account_id), store.open_store(account_id) as db:
        try:
            parsed = notes.parse(folder, title, text)
        except MemoryRefused as refusal:
            store.record(db, "note_refused", None, actor, note_id=note_id, text_hash=store.digest(str(text)), reason=str(refusal))
            # The connection's context manager rolls back on an exception; keep the refusal.
            db.commit()
            raise
        previous = None
        old_rel = None
        if note_id is not None:
            row = note_store.note(db, note_id)
            if row is None:
                raise HTTPException(404, "This note was not found.")
            if row["archived_at"] is not None:
                raise HTTPException(409, "This note is archived, so it can't be edited.")
            previous = note_store.latest(db, note_id)
            if base_version != previous["version"]:
                raise HTTPException(409, "This note changed since you opened it (in Mula or in Obsidian). Reload it to see the newer version before saving.")
            if same_version(previous, parsed):
                return {"outcome": "unchanged", "note_id": note_id, "version": previous["version"], "stale_links": 0, "stale_facts": 0}
            old_rel = current_file(db, note_id)
        owner = note_store.path_owner(db, parsed["path"])
        root = vault.notes_root(account_id)
        new_rel = vault.relative(parsed["folder"], parsed["title"])
        if (owner is not None and owner != note_id) or (new_rel != old_rel and vault.taken(root, new_rel, old_rel)):
            raise HTTPException(409, f"A note called “{parsed['title']}” is already in this folder. Choose another title, or open that note.")
        action = "note_created"
        if previous is not None:
            action = "note_saved"
        note_id, version = write_version(db, root, note_id, parsed, actor, action, old_rel)
        stale_links = 0
        stale_facts = 0
        renamed_from = None
        if previous is not None:
            keys = moved_keys(previous, parsed)
            stale_links, stale_facts = stale_link_count(db, keys, note_id)
            if keys:
                renamed_from = {"folder": previous["folder"], "title": previous["title"]}
    return {"outcome": "saved", "note_id": note_id, "version": version, "renamed_from": renamed_from,
            "stale_links": stale_links, "stale_facts": stale_facts}


def relink(account_id, note_id, old_folder, old_title, actor):
    """After a rename, point other notes' links at the new title, rewriting their files, each as a
    new audited version.

    Facts are append-only one-liners and are not rewritten; the count of facts still using the
    old title is returned so the owner can correct them.
    """
    vault.scan(account_id)
    with vault.lock_for(account_id), store.open_store(account_id) as db:
        current = note_store.latest(db, note_id)
        row = note_store.note(db, note_id)
        if current is None or row["archived_at"] is not None:
            raise HTTPException(404, "This note was not found.")
        old = {"folder": notes.check_folder(old_folder), "title": notes.check_name(old_title, "title")}
        parsed_current = {"title": current["title"], "path": notes.path_of(current["folder"], current["title"])}
        keys = moved_keys(old, parsed_current)
        # An old title or path another note now uses belongs to that note; its links must not move.
        keys = {link_key for link_key in keys if note_store.path_owner(db, link_key) is None and note_store.title_owner(db, link_key) is None}
        root = vault.notes_root(account_id)
        updated = 0
        if keys:
            marks = ",".join("?" for _ in keys)
            linking = [found["note_id"] for found in db.execute(
                f"SELECT DISTINCT note_id FROM note_links WHERE target_key IN ({marks}) AND note_id != ?", (*keys, note_id))]
            for other_id in linking:
                version = note_store.latest(db, other_id)
                rel = current_file(db, other_id)
                text, changed = notes.retarget_links(note_store.text_of(version), keys, current["title"])
                if changed == 0 or rel is None:
                    continue
                # The owner's own file: read leniently, so only the links change.
                parsed = notes.read_file(version["folder"], version["title"], text)
                write_version(db, root, other_id, parsed, actor, "note_relinked", rel)
                updated += 1
        _, stale_facts = stale_link_count(db, keys, note_id)
    return {"updated": updated, "stale_facts": stale_facts}


def archive_note(account_id, note_id, actor):
    """Take a note out of the tree, the map, search and link resolution, and move its file into
    the vault's `.trash/`, as Obsidian does. Its versions stay; the file is never deleted."""
    vault.scan(account_id)
    with vault.lock_for(account_id), store.open_store(account_id) as db:
        if note_store.note(db, note_id) is None:
            raise HTTPException(404, "This note was not found.")
        rel = current_file(db, note_id)
        note_store.archive(db, note_id)
        store.record(db, "note_archived", None, actor, note_id=note_id)
        if rel is not None:
            vault.trash(vault.notes_root(account_id), rel)
    return {"note_id": note_id}


def create_folder(account_id, folder, actor):
    """A new, empty folder in the vault. The audit keeps a hash of its path, not the name."""
    if actor not in ACTORS:
        raise ValueError("Unknown memory actor.")
    folder = notes.check_folder(folder)
    if not folder:
        raise MemoryRefused("Give the folder a name.")
    with vault.lock_for(account_id), store.open_store(account_id) as db:
        vault.make_folder(vault.notes_root(account_id), folder)
        store.record(db, "folder_created", None, actor, path_hash=store.digest(folder))
    return {"folder": folder}


def saved_by_message(account_id, message_id):
    """Facts the Operator saved during the turn that produced `message_id`."""
    if message_id is None:
        return []
    with store.open_store(account_id) as db:
        rows = db.execute("SELECT * FROM entries WHERE origin_message_id = ? AND actor = 'operator' ORDER BY id", (message_id,))
        return [store.public(row) for row in rows]
