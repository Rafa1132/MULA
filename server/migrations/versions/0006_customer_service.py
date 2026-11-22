"""The Customer Service agent: project-added template agents, the knowledge base, the WhatsApp
channel, and customer conversations with handoff tickets.

Revision ID: 0006_customer_service
Revises: 0005_a2a_acp_tools
Create Date: 2026-11-22

- `project_agents`: template agents (an agent file with `template: true`, such as
  customer_service) that a project added. Operator and Forecasting are always present and never
  get a row.
- `knowledge_entries`: what the Customer Service agent may answer from (features/knowledge), with a
  generated full-text column for search.
- `support_settings`: per project and agent: tone, whether WhatsApp is enabled for the agent, and
  the optional allowlist.
- `whatsapp_connections`: one WhatsApp Business number per project. The access token, app secret
  and verify token are AES-GCM ciphertext (common/secrets.py); the plain values are never stored.
  `id` is the webhook URL's path segment; `phone_number_id` is unique across all projects.
- `support_conversations`, `support_messages`, `support_tickets`: one conversation per customer per
  channel per project, its messages (an inbound `external_id` is unique, which is the duplicate
  check), and handoff tickets for the owner's inbox.
- `agent_tickets.conversation_id`: the customer conversation a Customer Service turn answers, so
  its handoff tool knows which conversation to hand off.
"""
from alembic import op

revision = "0006_customer_service"
down_revision = "0005_a2a_acp_tools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE project_agents (
            project_id TEXT NOT NULL REFERENCES projects(id),
            agent_id TEXT NOT NULL,
            added_at BIGINT NOT NULL,
            PRIMARY KEY (project_id, agent_id)
        )
    """)
    op.execute("""
        CREATE TABLE knowledge_entries (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            kind TEXT NOT NULL CHECK (kind IN ('faq', 'product', 'hours', 'policy')),
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            price TEXT NOT NULL DEFAULT '',
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            search tsvector GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || body || ' ' || price)) STORED
        )
    """)
    op.execute("CREATE INDEX knowledge_entries_project ON knowledge_entries (project_id, kind)")
    op.execute("CREATE INDEX knowledge_entries_search ON knowledge_entries USING GIN (search)")
    op.execute("""
        CREATE TABLE support_settings (
            project_id TEXT NOT NULL REFERENCES projects(id),
            agent_id TEXT NOT NULL,
            tone TEXT NOT NULL DEFAULT 'friendly' CHECK (tone IN ('friendly', 'professional', 'concise')),
            whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            allowlist_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
            PRIMARY KEY (project_id, agent_id)
        )
    """)
    op.execute("""
        CREATE TABLE whatsapp_connections (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
            phone_number_id TEXT NOT NULL UNIQUE,
            waba_id TEXT NOT NULL,
            access_token BYTEA NOT NULL,
            app_secret BYTEA NOT NULL,
            verify_token BYTEA NOT NULL,
            reopen_template TEXT NOT NULL DEFAULT '',
            reopen_language TEXT NOT NULL DEFAULT '',
            created_at BIGINT NOT NULL,
            verified_at BIGINT,
            last_event_at BIGINT
        )
    """)
    op.execute("""
        CREATE TABLE support_conversations (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            channel TEXT NOT NULL CHECK (channel IN ('whatsapp')),
            contact TEXT NOT NULL,
            contact_name TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'agent' CHECK (mode IN ('agent', 'human')),
            opted_out BOOLEAN NOT NULL DEFAULT FALSE,
            opted_out_at BIGINT,
            last_inbound_at BIGINT,
            summary TEXT NOT NULL DEFAULT '',
            summarized_through BIGINT NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            UNIQUE (project_id, channel, contact)
        )
    """)
    op.execute("""
        CREATE TABLE support_messages (
            id BIGSERIAL PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES support_conversations(id),
            direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
            author TEXT NOT NULL CHECK (author IN ('customer', 'agent', 'owner', 'system')),
            body TEXT NOT NULL,
            external_id TEXT UNIQUE,
            status TEXT NOT NULL,
            error TEXT NOT NULL DEFAULT '',
            created_at BIGINT NOT NULL,
            status_at BIGINT
        )
    """)
    op.execute("CREATE INDEX support_messages_conversation ON support_messages (conversation_id, id)")
    op.execute("""
        CREATE TABLE support_tickets (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            conversation_id TEXT NOT NULL REFERENCES support_conversations(id),
            reason TEXT NOT NULL,
            summary TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
            created_at BIGINT NOT NULL,
            resolved_at BIGINT
        )
    """)
    op.execute("CREATE INDEX support_tickets_project ON support_tickets (project_id, status, created_at)")
    op.execute("ALTER TABLE agent_tickets ADD COLUMN conversation_id TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE agent_tickets DROP COLUMN conversation_id")
    for table in ("support_tickets", "support_messages", "support_conversations", "whatsapp_connections",
                  "support_settings", "knowledge_entries", "project_agents"):
        op.execute(f"DROP TABLE {table}")
