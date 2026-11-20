# ACP (server)

Lets an editor or app that speaks the **Agent Client Protocol** (Zed, VS Code or JetBrains agent panels) talk to one Mula agent. The editor starts `server/scripts/mula_acp.py`, which speaks ACP (JSON-RPC 2.0 over stdio) to the editor and calls this backend over HTTP with a **client key**.

The runtime's own `hermes-acp` is not used. It would run the agent without Mula's persona, per-turn ticket, owner settings and memory.

## Client keys (`service.py`)

- Made in My agents → an agent → Advanced → Client access. Each key works for **one project and one agent**.
- A key is `mula_acp_` plus 32 random bytes. It is shown once; only its SHA-256 hash is stored (`client_keys`).
- At most 10 active keys per agent (`MAX_ACTIVE_KEYS`); labels are 1–60 characters.
- `resolve_key` refuses missing, malformed, unknown and revoked keys with the same 401, and re-checks that the key's account still belongs to the project, so archiving the project closes its keys.

## Endpoints (`routes.py`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/team/{agent_id}/client-keys` | session | `{ keys }`, never the secret or hash |
| POST | `/api/team/{agent_id}/client-keys` | session | `{ label }` → 201 `{ key, secret }`; 409 at the limit |
| DELETE | `/api/team/{agent_id}/client-keys/{key_id}` | session | Revokes it; returns `{ key }` |
| GET | `/api/acp/agent` | client key | `{ agent_id, card }` |
| POST | `/api/acp/prompt` | client key | `{ session_id, message ≤8,000 }`, streams NDJSON like the chats |

## A client turn

- It uses the agent's saved instructions, tools, brain and memory, through the same `operator_turn` / `agent_turn` as the web chat.
- Its runtime session is `uuid5(project conversation, "acp:<agent>:<session id>")`, so editor chats never mix with the owner's chats.
- It is saved in the agent's visible history with the note "Sent from a connected client (ACP)".
- It **cannot ask other agents**: its ticket is issued at depth 1 and the prompt says so (`CLIENT_LINE`). Nobody is in the editor to approve a request.

## The bridge (`server/scripts/mula_acp.py`)

- Handles `initialize`, `session/new`, `session/prompt` (streams `session/update` message chunks, ends with `end_turn`, `max_tokens` or `cancelled`) and `session/cancel`. `session/load` is not offered. Other methods get "method not found".
- Reads `MULA_CLIENT_KEY` and `MULA_URL` (default `http://127.0.0.1:8000`) from its environment, never from arguments, so the key doesn't show in process lists. Errors never include the key.
- Uses only the standard library and `httpx`, which the backend already depends on.

Example for Zed's `settings.json`:

```json
{
  "agent_servers": {
    "Mula Operator": {
      "command": "/path/to/LARAS/server/.venv/bin/python",
      "args": ["/path/to/LARAS/server/scripts/mula_acp.py"],
      "env": { "MULA_URL": "http://127.0.0.1:8000", "MULA_CLIENT_KEY": "mula_acp_…" }
    }
  }
}
```

## Limits

- The backend must be reachable from the editor's machine; `MULA_URL` is plain HTTP on this computer by default.
- There is no rate limit on client keys beyond their 256-bit randomness.

## Tests

`tests/test_acp.py`: keys (hashing, limits, revoke, other accounts, archived projects), client turns (own session, no delegation, Forecasting routing, bad input) and the bridge with the backend faked.
