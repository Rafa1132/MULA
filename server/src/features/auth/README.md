# Auth (server)

Local username/password accounts, login sessions and the account-owned visible chat history. Every other server feature depends on it: it provides `current_account()` and the shared database transaction (`database()`, PostgreSQL).

## What it does

- **Sign-up:** creates an account with a random `id` and its workspace (`features/workspaces`) in one transaction, then signs the user in. Conversations belong to projects; `accounts.conversation_id` is kept for the account's first project from before projects existed.
- **Login:** checks the password with scrypt (`n=16384, r=8, p=1`, 16-byte salt) and a constant-time comparison. Unknown usernames are hashed too, so response timing doesn't reveal whether an account exists. After 5 failures in 15 minutes, login is blocked with a 429.
- **Sessions:** a random token goes into the `mula_session` cookie (HttpOnly, SameSite=Strict, 7 days; `Secure` when `LARAS_SECURE_COOKIES=true`). Only the token's SHA-256 hash is stored.
- **Invite code (`MULA_INVITE_CODE`):** when the server is reachable from the internet (the public HTTPS setup in `docker/README.md`), sign-up needs this code, compared in constant time. At least 16 characters (`openssl rand -hex 16`), or the backend refuses to start. Sign-in never needs it, so existing accounts are unaffected. Empty (the default) means open sign-up, which is fine on this Mac or behind the SSH tunnel.
- **Relaxed rules for local testing (`MULA_RELAXED_AUTH=true`):** sign-up and login accept any non-empty username (trimmed, lowercased, up to 40 characters) and any non-empty password (up to 128). Passwords are still hashed and sessions, lockout and cookies work the same. It is off unless set; only the dev launcher (`./run.sh`, `scripts/run.py`) turns it on, and the backend refuses to start with it while `LARAS_SECURE_COOKIES=true`, so a production deployment keeps the strict rules. Export `MULA_RELAXED_AUTH=false` before `./run.sh` to try the strict rules locally.
- **Visible history:** `add_message`, `save_reply` and `history` store what the user sees in the chat. The model's working history is stored separately by Hermes; see `features/operator`.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` | 201; sets the cookie. Username is 3–40 characters `[a-z0-9_.-]`, lowercased; password is 10–128 characters (relaxed in development, below). Takes `invite` when `MULA_INVITE_CODE` is set; a missing or wrong code is 403 before any account is made |
| GET | `/api/auth/rules` | `{ relaxed, invite_required }`: whether the relaxed development rules are on and whether sign-up needs an invite code, so the form shows the right fields and hints. Never the code itself. Public |
| POST | `/api/auth/login` | Sets the cookie |
| GET | `/api/auth/me` | `{ id, username, conversation_id }` or 401 |
| POST | `/api/auth/logout` | Deletes the session row and the cookie |

`main.py` replaces validation errors on `/api/auth/*` with a generic message, so the submitted password is never echoed back.

## Files

| File | Purpose |
|---|---|
| `routes.py` | HTTP endpoints and cookie handling |
| `service.py` | Database access, hashing, sessions, message records. Imported elsewhere as `accounts` |
| `__init__.py` | Exports `accounts` (the service) and `router` |
| `tests/test_accounts.py` | Account and session tests |

## Storage

The PostgreSQL application database (`MULA_DATABASE_URL`, see `server/README.md`, "Database"). `service.database()` is the shared transaction every feature uses (`src/common/database.py`). The tables are defined in `server/migrations/versions/0001_initial.py`. This module owns:

- `accounts(id, username, salt, password_hash, conversation_id, created_at)`
- `sessions(token_hash, account_id, expires)`, with `expires` in epoch seconds
- `messages(id, project_id, role, text, note, agent_id)`, with `id` an identity column (`account_id` until migration 0002)
- `login_failures(username, occurred)`

The same database holds `agent_settings`, `agent_map_positions` (team), `forecast_runs` (forecasting), `agent_tickets` and `agent_requests` (agents). Since migration 0002 these are keyed by `project_id` (features/workspaces). Memory is a separate SQLite store per project (features/memory).

## Used by

Every router uses `Depends(accounts.current_account)`. Other features open the shared connection with `accounts.database()`.

## Limits

- One account is one workspace with one conversation.
- No roles, invitations or password reset.
- `history()` returns every message with no pagination.
