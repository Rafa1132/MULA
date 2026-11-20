"""Links between agents (A2A), client keys for editors (ACP) and the runtime tools an agent may use.

Revision ID: 0005_a2a_acp_tools
Revises: 0004_entry_experience
Create Date: 2026-11-20

- `agent_links`: how each agent may ask another in a project: `ask` (wait for the owner's OK),
  `auto` (go ahead), `off`, or `none` (not connected). A missing row means the default from the
  agent's file (`delegates_to`). Each project's saved Operator `delegation` becomes its link to
  Forecasting; the `delegation` column is left in place, unread, as the rollback copy.
- `agent_requests` gains the A2A shapes (features/a2a): `context_id`, the request as an A2A
  `message`, and the answer's `artifacts`. Rows saved before this keep NULL and are read from
  their `question` and `answer`. The A2A task state is derived from `status`, never stored twice.
- `agent_settings.runtime_toolsets`: the runtime toolsets the owner switched on for the agent,
  from the safe set its file allows (common/agent_catalog.py). Everything starts off.
- `client_keys`: keys that let an Agent Client Protocol client (an editor) talk to one agent in
  one project (features/acp). Only a SHA-256 hash of each key is stored; a revoked key stays as a
  row with `revoked_at` set, so its last use remains visible.
"""
from alembic import op

revision = "0005_a2a_acp_tools"
down_revision = "0004_entry_experience"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE agent_links (
            project_id TEXT NOT NULL REFERENCES projects(id),
            from_agent TEXT NOT NULL,
            to_agent TEXT NOT NULL,
            mode TEXT NOT NULL CHECK (mode IN ('ask', 'auto', 'off', 'none')),
            PRIMARY KEY (project_id, from_agent, to_agent),
            CHECK (from_agent <> to_agent)
        )
    """)
    op.execute("""
        INSERT INTO agent_links (project_id, from_agent, to_agent, mode)
        SELECT project_id, 'operator', 'forecasting', delegation FROM agent_settings
        WHERE agent_id = 'operator' AND delegation IN ('ask', 'auto', 'off')
    """)
    op.execute("""
        ALTER TABLE agent_requests
            ADD COLUMN context_id TEXT,
            ADD COLUMN message JSONB,
            ADD COLUMN artifacts JSONB
    """)
    op.execute("ALTER TABLE agent_settings ADD COLUMN runtime_toolsets JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("""
        CREATE TABLE client_keys (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            project_id TEXT NOT NULL REFERENCES projects(id),
            agent_id TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            created BIGINT NOT NULL,
            last_used BIGINT,
            revoked_at BIGINT
        )
    """)
    op.execute("CREATE INDEX client_keys_project ON client_keys(project_id, agent_id, created)")


def downgrade() -> None:
    op.execute("DROP TABLE client_keys")
    op.execute("ALTER TABLE agent_settings DROP COLUMN runtime_toolsets")
    op.execute("ALTER TABLE agent_requests DROP COLUMN artifacts, DROP COLUMN message, DROP COLUMN context_id")
    op.execute("DROP TABLE agent_links")
