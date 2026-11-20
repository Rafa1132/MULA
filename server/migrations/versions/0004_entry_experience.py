"""The workspace entry: the assistant's name, the spoken welcome, and projects it proposes.

Revision ID: 0004_entry_experience
Revises: 0003_orchestrator
Create Date: 2026-11-20

- `onboarding.assistant_name`: what the owner calls their assistant (null means the default,
  "Operator"). Rendered into the assistant's SOUL.md on every turn, like the personality.
- `onboarding.welcome_heard_at`: set when the spoken welcome is started, so it plays once per
  account. Every account that exists now is marked as having heard it: the welcome is for new
  accounts only, and returning owners get a silent orb.
- `onboarding.assistant_tools`: the assistant's capabilities, checked with team.require_tool.
  Only "project_create" exists; it is on by default and can be switched off in Settings.
- `projects.description`: an optional line about the business, shown on its card.
- `assistant_tickets`: per-turn tool tickets for the assistant. Unlike `agent_tickets`, which
  name a project, these name only the account, which comes from the signed-in session.
- `project_proposals`: projects the assistant suggested. Nothing is created until the owner
  confirms one with a button; the account is always the proposal's own.
"""
from alembic import op

revision = "0004_entry_experience"
down_revision = "0003_orchestrator"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE onboarding
            ADD COLUMN assistant_name TEXT,
            ADD COLUMN welcome_heard_at TIMESTAMPTZ,
            ADD COLUMN assistant_tools JSONB NOT NULL DEFAULT '["project_create"]'::jsonb
    """)
    # Existing accounts are not new: give each one a row and mark the welcome as heard.
    op.execute("""
        INSERT INTO onboarding (account_id, step, welcome_heard_at)
        SELECT id, 'assistant_name', now() FROM accounts
        ON CONFLICT (account_id) DO NOTHING
    """)
    op.execute("UPDATE onboarding SET welcome_heard_at = now() WHERE welcome_heard_at IS NULL")
    op.execute("ALTER TABLE projects ADD COLUMN description TEXT")
    op.execute("""
        CREATE TABLE assistant_tickets (
            token_hash TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            expires BIGINT NOT NULL
        )
    """)
    op.execute("CREATE INDEX assistant_tickets_expires ON assistant_tickets(expires)")
    op.execute("""
        CREATE TABLE project_proposals (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            ticket_hash TEXT NOT NULL,
            message_id BIGINT REFERENCES orchestrator_messages(id),
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'declined')),
            project_id TEXT REFERENCES projects(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            decided_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX project_proposals_account ON project_proposals(account_id, created_at)")
    op.execute("CREATE INDEX project_proposals_ticket ON project_proposals(ticket_hash)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS project_proposals")
    op.execute("DROP TABLE IF EXISTS assistant_tickets")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS description")
    op.execute("""
        ALTER TABLE onboarding
            DROP COLUMN IF EXISTS assistant_tools,
            DROP COLUMN IF EXISTS welcome_heard_at,
            DROP COLUMN IF EXISTS assistant_name
    """)
