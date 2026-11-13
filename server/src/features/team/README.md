# Team (server)

The list of available agents, plus each account's settings for each agent: extra instructions, reference data, and which tools are switched on. It also provides `require_tool()`, the check every capability goes through.

## Agent list (`AGENTS`)

| Agent | Tools |
|---|---|
| `operator` | `csv_read`, `memory_read`, `memory_write` |
| `forecasting` | `naive`, `moving_average`, `exponential_smoothing`, `seasonal_naive`, `drift`, `explain` |

These are application capabilities that FastAPI checks itself. They aren't Hermes tool definitions, and the model can't call them.

## Storage

The `agent_settings(account_id, agent_id, prompt, data, tools JSON, revision)` table in `accounts.sqlite3`, with primary key `(account_id, agent_id)`. If an account has no saved row, the agent uses an empty prompt and data, with **all tools enabled**.

Saving is atomic: `BEGIN IMMEDIATE` locks the database, checks the revision (409 on mismatch), then upserts the row with `revision + 1`. Unknown or duplicate tool names return 422.

## Endpoints

| Method | Path | Body |
|---|---|---|
| GET | `/api/team` | — returns `{ agents: [...] }` with each agent's definition and settings |
| PUT | `/api/team/{agent_id}` | `{ prompt ≤4,000, data ≤8,000, tools ≤10, revision }` |

## Service functions used by other features

- `settings(account_id, agent_id)`: the merged definition and saved settings
- `require_tool(config, tool)`: raises 403 "This tool is disabled…"
- `context(config)`: formats the owner's instructions and reference data for a system prompt, labelled as unable to grant tools or override limits

Used by `features/operator` and `features/forecasting`.

## Files

`service.py`, `routes.py`, `tests/test_team.py`.

## Limits and next steps

- Agents are defined in code. There's no manifest, install or uninstall, versioning, or third-party agent support.
- Changes take effect on the next request; nothing is pushed to running sessions.
- This module is the natural place to grow a Catalog registry: replace `AGENTS` with installable manifests and keep the per-account `agent_settings` row as the installation record.
