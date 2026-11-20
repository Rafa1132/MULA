"""The account's orchestrator: onboarding progress and the assistant chat.

Revision ID: 0003_orchestrator
Revises: 0002_workspaces_projects
Create Date: 2026-11-19

- `onboarding`: one row per account, made on its first visit to /workspace. `step` is where the
  scripted questions are; `completed_at` or `skipped_at` is set once they end. `personality` holds
  the owner's choices (tone, formality, language, emoji) that the orchestrator's SOUL.md is
  rendered from. The answers themselves live only in the account's USER.md file.
- `orchestrator_messages`: the visible chat with the orchestrator. It belongs to the account,
  not to a project, and no other account can read it.
"""
from alembic import op

revision = "0003_orchestrator"
down_revision = "0002_workspaces_projects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE onboarding (
            account_id TEXT PRIMARY KEY REFERENCES accounts(id),
            step TEXT NOT NULL,
            personality JSONB,
            completed_at TIMESTAMPTZ,
            skipped_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE orchestrator_messages (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
            text TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX orchestrator_messages_account ON orchestrator_messages(account_id, id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS orchestrator_messages")
    op.execute("DROP TABLE IF EXISTS onboarding")
