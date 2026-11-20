"""Client keys: what lets an Agent Client Protocol client (an editor) talk to one Mula agent.

The owner creates a key in My agents for one agent in one project. The key is shown once; only
its SHA-256 hash is stored, as for login sessions. Every use checks that the key is not revoked
and that the account that made it can still open the project, so leaving or archiving a project
closes its keys too. A key never signs anyone in to Mula: it can only send that agent messages.
"""
import hashlib
import hmac
import secrets
import time
from uuid import uuid4

from fastapi import HTTPException

from ..auth import accounts
from ..workspaces import service as workspaces

KEY_PREFIX = "mula_acp_"
# Active keys one agent may have in one project; revoke one to make another.
MAX_ACTIVE_KEYS = 10
LABEL_LIMIT = 60


def key_hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def public_key(row) -> dict:
    """A key as My agents shows it: never the key itself, nor its hash."""
    return {key: row[key] for key in ("id", "agent_id", "label", "created", "last_used", "revoked_at")}


def keys(project_id: str, agent_id: str) -> list[dict]:
    with accounts.database() as db:
        rows = db.execute("SELECT * FROM client_keys WHERE project_id = %s AND agent_id = %s ORDER BY created DESC, id",
                          (project_id, agent_id)).fetchall()
    return [public_key(row) for row in rows]


def create_key(account_id: str, project_id: str, agent_id: str, label: str) -> tuple[dict, str]:
    """A new key for this agent; returns (what My agents shows, the key, shown this once)."""
    label = " ".join(label.split())
    if not label:
        raise HTTPException(422, "Name the key, for example after the editor that will use it.")
    if len(label) > LABEL_LIMIT:
        raise HTTPException(422, f"Keep the name to {LABEL_LIMIT} characters.")
    key = KEY_PREFIX + secrets.token_urlsafe(32)
    with accounts.database() as db:
        # Serialise creation per agent, so two tabs cannot both pass the limit.
        db.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"client_keys:{project_id}:{agent_id}",))
        active = db.execute("SELECT count(*) AS active FROM client_keys WHERE project_id = %s AND agent_id = %s AND revoked_at IS NULL",
                            (project_id, agent_id)).fetchone()["active"]
        if active >= MAX_ACTIVE_KEYS:
            raise HTTPException(409, f"This agent already has {MAX_ACTIVE_KEYS} keys. Revoke one first.")
        row = db.execute('''INSERT INTO client_keys (id, account_id, project_id, agent_id, key_hash, label, created)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *''',
            (str(uuid4()), account_id, project_id, agent_id, key_hash(key), label, int(time.time()))).fetchone()
    return public_key(row), key


def revoke_key(project_id: str, agent_id: str, key_id: str) -> dict:
    with accounts.database() as db:
        row = db.execute("SELECT * FROM client_keys WHERE id = %s AND project_id = %s AND agent_id = %s FOR UPDATE",
                         (key_id, project_id, agent_id)).fetchone()
        if row is None:
            raise HTTPException(404, "This key was not found.")
        if row["revoked_at"] is None:
            row = db.execute("UPDATE client_keys SET revoked_at = %s WHERE id = %s RETURNING *", (int(time.time()), key_id)).fetchone()
    return public_key(row)


def resolve_key(authorization: str | None) -> dict:
    """The agent and project a client key opens, from an `Authorization: Bearer <key>` header.

    Every failure is the same 401, so a caller learns nothing about which keys exist.
    """
    refused = HTTPException(401, "This client key is not valid. Create a new one in My agents.")
    if not authorization or len(authorization) > 200:
        raise refused
    scheme, _, key = authorization.partition(" ")
    if scheme != "Bearer" or not key.startswith(KEY_PREFIX):
        raise refused
    digest = key_hash(key)
    with accounts.database() as db:
        row = db.execute("SELECT * FROM client_keys WHERE key_hash = %s", (digest,)).fetchone()
        # The lookup is by hash; compare again in constant time so timing never confirms a near miss.
        if row is None or not hmac.compare_digest(row["key_hash"], digest) or row["revoked_at"] is not None:
            raise refused
        db.execute("UPDATE client_keys SET last_used = %s WHERE id = %s", (int(time.time()), row["id"]))
    project = workspaces.member_project(row["account_id"], row["project_id"])
    if project is None:
        raise refused
    return {
        "key_id": row["id"],
        "agent_id": row["agent_id"],
        # The same shape as workspaces.access.current_project, so turns run exactly as in the web app.
        "project": {
            "id": project["id"],
            "name": project["name"],
            "display_name": project["name"] or workspaces.UNTITLED,
            "conversation_id": project["conversation_id"],
            "role": project["role"],
            "account_id": row["account_id"],
        },
    }
