# Auth (server)

Local username/password accounts, login sessions and the account-owned visible chat history. Every other server feature depends on it: it provides `current_account()` and the shared SQLite connection.

## What it does

- **Sign-up:** creates an account with a random `id` and a random, permanent `conversation_id` (the account's single Operator conversation), then signs the user in.
- **Login:** checks the password with scrypt (`n=16384, r=8, p=1`, 16-byte salt) and a constant-time comparison. Unknown usernames are hashed too, so response timing doesn't reveal whether an account exists. After 5 failures in 15 minutes, login is blocked with a 429.
- **Sessions:** a random token goes into the `mula_session` cookie (HttpOnly, SameSite=Strict, 7 days; `Secure` when `LARAS_SECURE_COOKIES=true`). Only the token's SHA-256 hash is stored.
- **Visible history:** `add_message`, `save_reply` and `history` store what the user sees in the chat. The model's working history is stored separately by Hermes; see `features/operator`.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` | 201; sets the cookie. Username is 3–40 characters `[a-z0-9_.-]`, lowercased; password is 10–128 characters |
| POST | `/api/auth/login` | Sets the cookie |
| GET | `/api/auth/me` | `{ id, username, conversation_id }` or 401 |
| POST | `/api/auth/logout` | Deletes the session row and the cookie |

`main.py` replaces validation errors on `/api/auth/*` with a generic message, so the submitted password is never echoed back.

## Files

| File | Purpose |
|---|---|
| `routes.py` | HTTP endpoints and cookie handling |
| `service.py` | SQLite access, hashing, sessions, message records. Imported elsewhere as `accounts` |
| `__init__.py` | Exports `accounts` (the service) and `router` |
| `tests/test_accounts.py` | Account and session tests |

## Storage

`.runtime/accounts.sqlite3` (override with `LARAS_ACCOUNT_DB`). The folder is created with mode 0700 and the file is set to 0600. This module owns these tables:

- `accounts(id, username, salt, password_hash, conversation_id)`
- `sessions(token_hash, account_id, expires)`
- `messages(id, account_id, role, text, note)`
- `login_failures(username, occurred)`

Other features add their own tables to the same file: `agent_settings`, `forecast_runs` and `memory_*`.

## Used by

Every router uses `Depends(accounts.current_account)`. Other features open the shared connection with `accounts.database()`.

## Limits

- One account is one workspace with one conversation.
- No roles, invitations or password reset.
- `history()` returns every message with no pagination.
