"""Workspaces and projects: each project is one business with its own agents, memory and apps.

Revision ID: 0002_workspaces_projects
Revises: 0001_initial
Create Date: 2026-11-19

- `workspaces` and `workspace_members`: one workspace per account for now (its owner); inviting
  teammates will add members later.
- `projects` and `project_members`: a project belongs to a workspace; a member row is what lets
  an account open it. `name` is NULL until the owner names it ("Untitled project" in the app).
  `conversation_id` is the project's Operator conversation.
- The tables that held one account's business data (`messages`, `agent_settings`,
  `agent_map_positions`, `forecast_runs`, `agent_tickets`, `agent_requests`) now belong to a
  project: `account_id` is renamed `project_id` and points at `projects`.

Existing data moves without copying a row: every existing account gets a workspace and one
project whose id is the account id, holding the account's conversation. The per-project files
(the memory store under workspaces/<id>/ and the runtime profile mula-<id>) are named after that
id, so they belong to the project as they are.
"""
from alembic import op

revision = "0002_workspaces_projects"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

# (table, old index, new index, indexed columns after the rename); None where there is no index.
PROJECT_TABLES = (
    ("messages", "messages_account_agent", "messages_project_agent", "project_id, agent_id, id"),
    ("agent_settings", None, None, None),
    ("agent_map_positions", None, None, None),
    ("forecast_runs", "forecast_runs_account", "forecast_runs_project", "project_id, seq"),
    ("agent_tickets", None, None, None),
    ("agent_requests", "agent_requests_account", "agent_requests_project", "project_id, created, seq"),
)


def upgrade() -> None:
    op.execute("""
        CREATE TABLE workspaces (
            id TEXT PRIMARY KEY,
            owner_account_id TEXT NOT NULL REFERENCES accounts(id),
            name TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX workspaces_owner ON workspaces(owner_account_id)")
    op.execute("""
        CREATE TABLE workspace_members (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            account_id TEXT NOT NULL REFERENCES accounts(id),
            role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
            PRIMARY KEY (workspace_id, account_id)
        )
    """)
    op.execute("""
        CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            name TEXT,
            conversation_id TEXT UNIQUE NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            seq BIGINT GENERATED ALWAYS AS IDENTITY,
            archived_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX projects_workspace ON projects(workspace_id, seq)")
    op.execute("""
        CREATE TABLE project_members (
            project_id TEXT NOT NULL REFERENCES projects(id),
            account_id TEXT NOT NULL REFERENCES accounts(id),
            role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
            PRIMARY KEY (project_id, account_id)
        )
    """)
    op.execute("CREATE INDEX project_members_account ON project_members(account_id)")

    # One workspace and one project per existing account, oldest account first.
    op.execute("""
        INSERT INTO workspaces (id, owner_account_id, created_at)
        SELECT gen_random_uuid()::text, id, created_at FROM accounts ORDER BY created_at, id
    """)
    op.execute("""
        INSERT INTO workspace_members (workspace_id, account_id, role)
        SELECT id, owner_account_id, 'owner' FROM workspaces
    """)
    op.execute("""
        INSERT INTO projects (id, workspace_id, conversation_id, created_at)
        SELECT accounts.id, workspaces.id, accounts.conversation_id, accounts.created_at
        FROM accounts JOIN workspaces ON workspaces.owner_account_id = accounts.id
        ORDER BY accounts.created_at, accounts.id
    """)
    op.execute("""
        INSERT INTO project_members (project_id, account_id, role)
        SELECT id, id, 'owner' FROM projects
    """)

    for table, old_index, new_index, columns in PROJECT_TABLES:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT {table}_account_id_fkey")
        op.execute(f"ALTER TABLE {table} RENAME COLUMN account_id TO project_id")
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {table}_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id)")
        if old_index:
            op.execute(f"ALTER INDEX {old_index} RENAME TO {new_index}")


def downgrade() -> None:
    # Only safe while every project is still an account's first project (id = account id).
    for table, old_index, new_index, columns in PROJECT_TABLES:
        op.execute(f"DELETE FROM {table} WHERE project_id NOT IN (SELECT id FROM accounts)")
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT {table}_project_id_fkey")
        op.execute(f"ALTER TABLE {table} RENAME COLUMN project_id TO account_id")
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {table}_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id)")
        if old_index:
            op.execute(f"ALTER INDEX {new_index} RENAME TO {old_index}")
    for table in ("project_members", "projects", "workspace_members", "workspaces"):
        op.execute(f"DROP TABLE IF EXISTS {table}")
