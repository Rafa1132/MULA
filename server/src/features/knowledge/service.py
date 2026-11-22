"""The knowledge base: FAQ entries, products or services, opening hours and policies, per project.

The Customer Service agent answers only from these entries (features/support). Table
`knowledge_entries` is defined in server/migrations; its `search` column is a generated full-text
vector, so search needs no index maintenance here.
"""
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth import accounts

KINDS = ("faq", "product", "hours", "policy")
KIND_LABELS = {"faq": "FAQ", "product": "Product or service", "hours": "Opening hours", "policy": "Policy"}
MAX_ENTRIES = 500
# A base this small is given to the agent whole: matching is then the model's job, which beats
# keyword search for a handful of entries.
SMALL_BASE = 30
SEARCH_LIMIT = 8
# What one turn may receive, so a long base can't crowd out the conversation.
PROMPT_CHARACTERS = 12_000


class EntryInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    kind: str
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    price: str = Field(default="", max_length=60)

    @field_validator("kind")
    @classmethod
    def known_kind(cls, value: str) -> str:
        if value not in KINDS:
            raise ValueError("Choose faq, product, hours or policy.")
        return value

    @field_validator("title", "body")
    @classmethod
    def readable(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Write something.")
        return value

    @field_validator("price")
    @classmethod
    def trimmed(cls, value: str) -> str:
        return value.strip()


def require_entry_id(entry_id: str) -> str:
    try:
        return uuid.UUID(entry_id).hex
    except (ValueError, AttributeError, TypeError) as error:
        raise HTTPException(404, "That entry isn't in this knowledge base.") from error


def public(row) -> dict:
    return {"id": row["id"], "kind": row["kind"], "title": row["title"], "body": row["body"], "price": row["price"],
            "updated_at": row["updated_at"]}


def entries(project_id: str) -> list[dict]:
    with accounts.database() as db:
        rows = db.execute("SELECT id, kind, title, body, price, updated_at FROM knowledge_entries WHERE project_id = %s ORDER BY kind, title, id",
                          (project_id,)).fetchall()
    return [public(row) for row in rows]


def count(project_id: str) -> int:
    with accounts.database() as db:
        return db.execute("SELECT count(*) AS n FROM knowledge_entries WHERE project_id = %s", (project_id,)).fetchone()["n"]


def create(project_id: str, value: EntryInput) -> dict:
    now = int(time.time())
    entry_id = uuid.uuid4().hex
    with accounts.database() as db:
        # A transaction-scoped lock keeps the cap exact when two saves race.
        db.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"knowledge:{project_id}",))
        total = db.execute("SELECT count(*) AS n FROM knowledge_entries WHERE project_id = %s", (project_id,)).fetchone()["n"]
        if total >= MAX_ENTRIES:
            raise HTTPException(409, f"A knowledge base holds at most {MAX_ENTRIES} entries. Remove some first.")
        db.execute("INSERT INTO knowledge_entries (id, project_id, kind, title, body, price, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                   (entry_id, project_id, value.kind, value.title, value.body, value.price, now, now))
    return {"id": entry_id, "kind": value.kind, "title": value.title, "body": value.body, "price": value.price, "updated_at": now}


def update(project_id: str, entry_id: str, value: EntryInput) -> dict:
    entry_id = require_entry_id(entry_id)
    now = int(time.time())
    with accounts.database() as db:
        row = db.execute("""UPDATE knowledge_entries SET kind = %s, title = %s, body = %s, price = %s, updated_at = %s
                            WHERE id = %s AND project_id = %s RETURNING id, kind, title, body, price, updated_at""",
                         (value.kind, value.title, value.body, value.price, now, entry_id, project_id)).fetchone()
    if row is None:
        raise HTTPException(404, "That entry isn't in this knowledge base.")
    return public(row)


def delete(project_id: str, entry_id: str) -> None:
    entry_id = require_entry_id(entry_id)
    with accounts.database() as db:
        deleted = db.execute("DELETE FROM knowledge_entries WHERE id = %s AND project_id = %s", (entry_id, project_id)).rowcount
    if deleted == 0:
        raise HTTPException(404, "That entry isn't in this knowledge base.")


def search(project_id: str, query: str, limit: int = SEARCH_LIMIT) -> list[dict]:
    """Entries that match `query`: every entry for a small base, else full-text matches, else
    entries sharing any word of three or more letters with the query."""
    if count(project_id) <= SMALL_BASE:
        return entries(project_id)
    with accounts.database() as db:
        rows = db.execute("""SELECT id, kind, title, body, price, updated_at FROM knowledge_entries
                             WHERE project_id = %s AND search @@ plainto_tsquery('simple', %s)
                             ORDER BY ts_rank(search, plainto_tsquery('simple', %s)) DESC LIMIT %s""",
                          (project_id, query, query, limit)).fetchall()
        if not rows:
            words = [word for word in query.lower().split() if len(word) >= 3][:8]
            if words:
                # Parameterized patterns; the % wildcards are added here, never taken from the query.
                patterns = ["%" + word.replace("%", "").replace("_", "") + "%" for word in words]
                rows = db.execute("""SELECT id, kind, title, body, price, updated_at FROM knowledge_entries
                                     WHERE project_id = %s AND (lower(title || ' ' || body) LIKE ANY(%s)) LIMIT %s""",
                                  (project_id, patterns, limit)).fetchall()
    return [public(row) for row in rows]


def format_entries(found: list[dict]) -> str:
    """Entries as plain text for the agent, cut to PROMPT_CHARACTERS."""
    lines = []
    used = 0
    for entry in found:
        line = f"- [{KIND_LABELS[entry['kind']]}] {entry['title']}: {entry['body']}"
        if entry["price"]:
            line += f" (price: {entry['price']})"
        if used + len(line) > PROMPT_CHARACTERS:
            lines.append("- (more entries; use knowledge_search for others)")
            break
        lines.append(line)
        used += len(line)
    return "\n".join(lines)


def all_text(project_id: str) -> str:
    """Every entry's text, for the grounding check (grounding.py)."""
    return "\n".join(f"{entry['title']} {entry['body']} {entry['price']}" for entry in entries(project_id))
