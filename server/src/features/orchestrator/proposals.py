"""Projects the workspace assistant proposes, and the owner confirms.

Projects are Mula's own idea, so the runtime has no tool for them. The assistant gets one Mula
tool, `create_project` (agents/tools.py), through the same /mcp server as project agents:

1. Each assistant turn gets a ticket that names only the account (`assistant_tickets`). The
   account comes from the signed-in session that sent the message, never from the model.
2. The tool checks the ticket and the owner's switch (`team.require_tool` on the assistant's
   settings), then saves a *pending* proposal. It creates nothing.
3. The reply shows the proposal with "Create project" and "Not now". Confirming is an ordinary
   signed-in request: the proposal must belong to that account, and the workspace's project limit
   is checked again in the same transaction that creates the project.
"""
import hashlib
import secrets
import time
from uuid import uuid4

from fastapi import HTTPException

from ...common.database import database
from ..agents.service import ToolDenied
from ..team import service as team
from ..workspaces import service as workspaces
from . import onboarding

TOOL = "project_create"
TICKET_SECONDS = 15 * 60
# Enough to compare a few names; more pending at once would only clutter the chat.
MAX_PENDING = 5


def ticket_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def issue_ticket(account_id):
    """A ticket for one assistant turn. Only its hash is stored."""
    token = secrets.token_urlsafe(24)
    now = int(time.time())
    with database() as db:
        db.execute("DELETE FROM assistant_tickets WHERE expires <= %s", (now,))
        db.execute("INSERT INTO assistant_tickets (token_hash, account_id, expires) VALUES (%s, %s, %s)",
                   (ticket_hash(token), account_id, now + TICKET_SECONDS))
    return token


def resolve_ticket(token):
    """The account a live assistant ticket was issued to. Project agents' tickets never match."""
    if not isinstance(token, str) or not token:
        raise ToolDenied("Pass the tool ticket from your instructions as `ticket`.")
    with database() as db:
        row = db.execute("SELECT account_id FROM assistant_tickets WHERE token_hash = %s AND expires > %s",
                         (ticket_hash(token), int(time.time()))).fetchone()
    if row is None:
        raise ToolDenied("This tool ticket is invalid or expired, or this agent can't propose projects.")
    return row["account_id"]


def tool_instructions(account_id, token):
    """The system prompt section for this turn's tool, or a line saying it is off."""
    if TOOL not in onboarding.assistant_settings(account_id)["tools"]:
        return ("\n\n## Tools\n\nProposing projects is switched off in Settings. Don't call create_project; "
                "point the owner to the New project button under the chat instead.\n")
    return ("\n\n## Tools\n\n"
            f"Pass this ticket as `ticket` on every Mula tool call: {token}\n"
            "Never show the ticket to the owner. It expires after this message.\n"
            "When the owner asks you to start, set up or add a project (a separate business), call create_project "
            "once with a short name and, if you know it, a one-line description. It only proposes the project: "
            "tell the owner to confirm with the Create project button under your reply. Never say a project "
            "was created. Don't call it when the owner is only asking about projects.\n")


def public(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "status": row["status"],
        "project_id": row["project_id"],
        "message_id": row["message_id"],
    }


def propose(token, name, description):
    """The create_project tool: record a pending proposal for the ticket's account."""
    account_id = resolve_ticket(token)
    try:
        team.require_tool({"tools": onboarding.assistant_settings(account_id)["tools"]}, TOOL)
    except HTTPException as error:
        raise ToolDenied("The owner has switched off proposing projects in Settings. Point them to the New project button.") from error
    cleaned_name = workspaces.clean_name(name)
    if cleaned_name is None:
        raise ToolDenied("Give the project a short name.")
    cleaned_description = workspaces.clean_description(description)
    if not workspaces.can_add_project(account_id):
        raise ToolDenied(workspaces.at_limit_message())
    with database() as db:
        pending = db.execute("SELECT count(*) AS n FROM project_proposals WHERE account_id = %s AND status = 'pending'",
                             (account_id,)).fetchone()["n"]
        if pending >= MAX_PENDING:
            raise ToolDenied("The owner already has several proposals waiting. Ask them to create or dismiss those first.")
        row = db.execute('''INSERT INTO project_proposals (id, account_id, ticket_hash, name, description)
                            VALUES (%s, %s, %s, %s, %s) RETURNING *''',
                         (str(uuid4()), account_id, ticket_hash(token), cleaned_name, cleaned_description)).fetchone()
    return public(row)


def attach(token, message_id):
    """Link the proposals made during a turn to the reply that mentions them; returns them."""
    with database() as db:
        rows = db.execute('''UPDATE project_proposals SET message_id = %s WHERE ticket_hash = %s AND message_id IS NULL
                             RETURNING *''', (message_id, ticket_hash(token))).fetchall()
    return [public(row) for row in sorted(rows, key=lambda row: row["created_at"])]


def discard(token):
    """A turn that failed never shows its proposals, so they must not count as waiting either."""
    with database() as db:
        db.execute('''UPDATE project_proposals SET status = 'declined', decided_at = now()
                      WHERE ticket_hash = %s AND message_id IS NULL AND status = 'pending' ''', (ticket_hash(token),))


def for_account(account_id):
    with database() as db:
        rows = db.execute('''SELECT * FROM project_proposals WHERE account_id = %s AND message_id IS NOT NULL
                             ORDER BY created_at''', (account_id,)).fetchall()
    return [public(row) for row in rows]


def pending_row(db, account_id, proposal_id):
    """The account's own proposal, locked. Another account's id looks exactly like a missing one."""
    row = db.execute("SELECT * FROM project_proposals WHERE id = %s AND account_id = %s FOR UPDATE",
                     (proposal_id, account_id)).fetchone()
    if row is None:
        raise HTTPException(404, "This proposal was not found.")
    if row["status"] != "pending":
        raise HTTPException(409, "This proposal was already answered.")
    return row


def confirm(account_id, proposal_id):
    """Create the proposed project for the signed-in account and mark the proposal created."""
    with database() as db:
        row = pending_row(db, account_id, proposal_id)
        project_id = workspaces.insert_project(db, account_id, row["name"], row["description"])
        row = db.execute('''UPDATE project_proposals SET status = 'created', project_id = %s, decided_at = now()
                            WHERE id = %s RETURNING *''', (project_id, proposal_id)).fetchone()
    # After the commit, like "New project": the project's own runtime profile.
    workspaces.provision_profile(project_id)
    return {"proposal": public(row), "project": workspaces.public_project(workspaces.member_project(account_id, project_id))}


def decline(account_id, proposal_id):
    with database() as db:
        pending_row(db, account_id, proposal_id)
        row = db.execute('''UPDATE project_proposals SET status = 'declined', decided_at = now()
                            WHERE id = %s RETURNING *''', (proposal_id,)).fetchone()
    return {"proposal": public(row)}
