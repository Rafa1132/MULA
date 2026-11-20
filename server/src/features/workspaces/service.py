"""Workspaces and projects.

A workspace is what an account sees first: its projects and its orchestrator. A project is one
business, with its own Operator conversation, agents, memory and apps; everything a project owns
is keyed by its id (the database rows, `workspaces/<project>/` and the runtime profile
`mula-<project>`). An account can open a project only through a `project_members` row, checked by
`access.current_project` on every project request.

Each account has one workspace, which it owns; inviting teammates is not built yet. A workspace
holds at most MAX_PROJECTS projects, whether they are made with "New project" or confirmed from
the assistant's proposal.
"""
from uuid import UUID, uuid4

from fastapi import HTTPException

from ...common import profiles
from ...common.database import database

MAX_NAME = 80
MAX_DESCRIPTION = 300
# Enough for every business one owner runs; each project also has its own runtime profile on disk.
MAX_PROJECTS = 20
UNTITLED = "Untitled project"


def create_workspace(db, account_id):
    """The account's own workspace, inside the sign-up transaction."""
    workspace_id = str(uuid4())
    db.execute("INSERT INTO workspaces (id, owner_account_id) VALUES (%s, %s)", (workspace_id, account_id))
    db.execute("INSERT INTO workspace_members (workspace_id, account_id, role) VALUES (%s, %s, 'owner')", (workspace_id, account_id))
    return workspace_id


def workspace_of(db, account_id):
    """The workspace the account owns. Every account has exactly one (sign-up or migration 0002)."""
    row = db.execute("SELECT id, name FROM workspaces WHERE owner_account_id = %s ORDER BY created_at LIMIT 1", (account_id,)).fetchone()
    if row is None:
        raise HTTPException(409, "This account has no workspace yet. Sign out and in again.")
    return row


def clean_name(name):
    """A trimmed project name, or None when blank (shown as "Untitled project")."""
    if name is None:
        return None
    if not isinstance(name, str):
        raise HTTPException(422, "A project name must be text.")
    name = " ".join(name.split())
    if not name:
        return None
    if len(name) > MAX_NAME:
        raise HTTPException(422, f"Keep the project name to {MAX_NAME} characters.")
    return name


def clean_description(description):
    """A one-line description, or None when blank."""
    if description is None:
        return None
    if not isinstance(description, str):
        raise HTTPException(422, "A project description must be text.")
    description = " ".join(description.split())
    if not description:
        return None
    if len(description) > MAX_DESCRIPTION:
        raise HTTPException(422, f"Keep the project description to {MAX_DESCRIPTION} characters.")
    return description


def public_project(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "display_name": row["name"] or UNTITLED,
        "description": row["description"],
        "role": row["role"],
        "created_at": row["created_at"].isoformat(),
    }


def projects_for(account_id):
    """The projects this account can open, oldest first."""
    with database() as db:
        rows = db.execute('''SELECT projects.*, project_members.role FROM projects
            JOIN project_members ON project_members.project_id = projects.id
            WHERE project_members.account_id = %s AND projects.archived_at IS NULL
            ORDER BY projects.seq''', (account_id,)).fetchall()
    return [public_project(row) for row in rows]


def member_project(account_id, project_id):
    """The project row with this account's role, or None if the account can't open it."""
    try:
        project_id = str(UUID(project_id))
    except (ValueError, TypeError, AttributeError):
        return None
    with database() as db:
        return db.execute('''SELECT projects.*, project_members.role FROM projects
            JOIN project_members ON project_members.project_id = projects.id
            WHERE projects.id = %s AND project_members.account_id = %s AND projects.archived_at IS NULL''',
            (project_id, account_id)).fetchone()


def project_count(db, workspace_id):
    row = db.execute("SELECT count(*) AS n FROM projects WHERE workspace_id = %s AND archived_at IS NULL", (workspace_id,)).fetchone()
    return row["n"]


def at_limit_message():
    return f"You have {MAX_PROJECTS} projects, the most a workspace can hold for now."


def insert_project(db, account_id, name, description=None):
    """Add a project to the account's workspace inside the caller's transaction; returns its id.

    The workspace row is locked first, so two requests at once can't both pass the limit.
    The runtime profile is written by the caller after the transaction commits.
    """
    name = clean_name(name)
    description = clean_description(description)
    workspace = workspace_of(db, account_id)
    db.execute("SELECT id FROM workspaces WHERE id = %s FOR UPDATE", (workspace["id"],))
    if project_count(db, workspace["id"]) >= MAX_PROJECTS:
        raise HTTPException(409, at_limit_message())
    project_id = str(uuid4())
    db.execute("INSERT INTO projects (id, workspace_id, name, description, conversation_id) VALUES (%s, %s, %s, %s, %s)",
               (project_id, workspace["id"], name, description, str(uuid4())))
    db.execute("INSERT INTO project_members (project_id, account_id, role) VALUES (%s, %s, 'owner')", (project_id, account_id))
    return project_id


def create_project(account_id, name, description=None):
    """A new project in the account's workspace, owned by the account, with its own runtime profile."""
    with database() as db:
        project_id = insert_project(db, account_id, name, description)
    provision_profile(project_id)
    return public_project(member_project(account_id, project_id))


def can_add_project(account_id):
    with database() as db:
        workspace = workspace_of(db, account_id)
        return project_count(db, workspace["id"]) < MAX_PROJECTS


def rename_project(account_id, project_id, name):
    row = member_project(account_id, project_id)
    if row is None:
        raise HTTPException(404, "This project was not found.")
    if row["role"] != "owner":
        raise HTTPException(403, "Only the project's owner can rename it.")
    with database() as db:
        db.execute("UPDATE projects SET name = %s WHERE id = %s", (clean_name(name), row["id"]))
    return public_project(member_project(account_id, row["id"]))


def provision_profile(project_id):
    """Each project gets its own runtime profile, so no runtime state is shared between projects."""
    if not profiles.configured():
        # Without the seed there is nothing to derive a key from; every agent turn says so.
        return
    try:
        profiles.ensure_profile(project_id)
    except profiles.ProfileError as error:
        raise HTTPException(503, str(error)) from error
    # The gateway finds new profile folders on a 30-second rescan; asking now makes the first turn work.
    profiles.announce_profile(project_id)
