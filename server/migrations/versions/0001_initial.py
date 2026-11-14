"""The application schema as it existed in SQLite, in PostgreSQL types.

Revision ID: 0001_initial
Revises: None
Create Date: 2026-11-14

Differences from the SQLite file, all behaviour-preserving:
- `messages.id`, `forecast_runs.seq` and `agent_requests.seq` are identity columns (SQLite used
  the implicit rowid for ids and for insertion order);
- JSON kept as text (`agent_settings.tools`, `forecast_runs.report`, the two `attachment`
  columns) becomes JSONB;
- `approved_in_advance` becomes a boolean, `x`/`y` double precision;
- `forecast_runs.created_at` is a timestamp with time zone; `accounts.created_at` is new and
  gives accounts a stable creation order (SQLite ordered them by rowid);
- epoch seconds (`expires`, `occurred`, `created`) stay integers, so expiry arithmetic is unchanged;
- indexes cover the existing WHERE and ORDER BY clauses.
"""
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

TABLES = (
    "agent_requests", "agent_tickets", "forecast_runs", "agent_map_positions", "agent_settings",
    "login_failures", "messages", "sessions", "accounts",
)


def upgrade() -> None:
    op.execute("""
        CREATE TABLE accounts (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            conversation_id TEXT UNIQUE NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE sessions (
            token_hash TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            expires BIGINT NOT NULL
        )
    """)
    op.execute("CREATE INDEX sessions_account ON sessions(account_id)")
    op.execute("""
        CREATE TABLE messages (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            note TEXT,
            agent_id TEXT NOT NULL DEFAULT 'operator'
        )
    """)
    op.execute("CREATE INDEX messages_account_agent ON messages(account_id, agent_id, id)")
    op.execute("""
        CREATE TABLE login_failures (
            username TEXT NOT NULL,
            occurred BIGINT NOT NULL
        )
    """)
    op.execute("CREATE INDEX login_failures_username ON login_failures(username)")
    op.execute("""
        CREATE TABLE agent_settings (
            account_id TEXT NOT NULL REFERENCES accounts(id),
            agent_id TEXT NOT NULL,
            prompt TEXT NOT NULL,
            data TEXT NOT NULL,
            tools JSONB NOT NULL,
            revision INTEGER NOT NULL,
            brain TEXT,
            delegation TEXT,
            PRIMARY KEY (account_id, agent_id)
        )
    """)
    op.execute("""
        CREATE TABLE agent_map_positions (
            account_id TEXT NOT NULL REFERENCES accounts(id),
            agent_id TEXT NOT NULL,
            x DOUBLE PRECISION NOT NULL,
            y DOUBLE PRECISION NOT NULL,
            PRIMARY KEY (account_id, agent_id)
        )
    """)
    op.execute("""
        CREATE TABLE forecast_runs (
            seq BIGINT GENERATED ALWAYS AS IDENTITY,
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            report JSONB NOT NULL,
            explanation TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX forecast_runs_account ON forecast_runs(account_id, seq)")
    op.execute("""
        CREATE TABLE agent_tickets (
            token_hash TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            agent_id TEXT NOT NULL,
            attachment JSONB,
            message_id BIGINT,
            depth INTEGER NOT NULL,
            expires BIGINT NOT NULL
        )
    """)
    op.execute("CREATE INDEX agent_tickets_expires ON agent_tickets(expires)")
    # seq keeps requests created in the same second in the order they were made (SQLite's rowid).
    op.execute("""
        CREATE TABLE agent_requests (
            seq BIGINT GENERATED ALWAYS AS IDENTITY,
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id),
            from_agent TEXT NOT NULL,
            to_agent TEXT NOT NULL,
            question TEXT NOT NULL,
            attachment JSONB,
            ticket_hash TEXT NOT NULL,
            message_id BIGINT,
            status TEXT NOT NULL,
            answer TEXT,
            created BIGINT NOT NULL,
            approved_in_advance BOOLEAN NOT NULL DEFAULT FALSE
        )
    """)
    op.execute("CREATE INDEX agent_requests_account ON agent_requests(account_id, created, seq)")
    op.execute("CREATE INDEX agent_requests_ticket ON agent_requests(ticket_hash)")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table}")
