"""The one way anything gets into memory: validate, filter, dedupe, commit, audit, summarise.

The Operator's `remember` tool, the owner's `/remember` command and the Memory page
all call `remember`. Corrections go through `remember(..., replaces=id)`, which adds
the new fact and marks the old one superseded; nothing is ever rewritten.
"""
from fastapi import HTTPException

from . import filters, store, summary
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


def saved_by_message(account_id, message_id):
    """Facts the Operator saved during the turn that produced `message_id`."""
    if message_id is None:
        return []
    with store.open_store(account_id) as db:
        rows = db.execute("SELECT * FROM entries WHERE origin_message_id = ? AND actor = 'operator' ORDER BY id", (message_id,))
        return [store.public(row) for row in rows]
