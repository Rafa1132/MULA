# Team (server)

The list of available agents, plus each account's settings for each agent: extra instructions, reference data, which tools are switched on, which brain it uses, whether the Operator may ask other agents, and where its card sits on the My agents map. It also provides `require_tool()`, the check every capability goes through.

## Agent list (`AGENTS`)

| Agent | Tools |
|---|---|
| `operator` | `csv_read`, `memory_read`, `memory_write` |
| `forecasting` | `naive`, `moving_average`, `exponential_smoothing`, `seasonal_naive`, `drift`, `explain` |

These are application capabilities that FastAPI checks itself. The model can't call them directly; the agent tools in `features/agents` (such as `calculate_forecast`) check them through `require_tool` before running.

`delegates_to` lists the agents an agent may ask for help: `["forecasting"]` for the Operator, empty for Forecasting.

Every agent has a selectable brain from `common/brains.py`. Its settings include `brain` and `available_brains`, where each brain has a `name`, `description`, `location` (`local` or `cloud`) and `status`. The routes fill in `status` from the runtime's `GET /v1/models`: `ready`, `needs_setup` (no route configured), or `unchecked` (runtime unreachable). The default brain is always `ready`.

## Storage

The `agent_settings(account_id, agent_id, prompt, data, tools JSON, revision, brain, delegation)` table in `accounts.sqlite3`, with primary key `(account_id, agent_id)`. If an account has no saved row, the agent uses an empty prompt and data, with **all tools enabled** and the default brain. Older databases get the nullable `brain` and `delegation` columns added on first use. `NULL`, or a brain no longer in the registry, means the default brain. For agents with `delegates_to`, a `NULL` delegation means `ask`; for the others `delegation` is always `null`.

Saving is atomic: `BEGIN IMMEDIATE` locks the database, checks the revision (409 on mismatch), then upserts the row with `revision + 1`. Unknown or duplicate tool names return 422.

Map positions live in a separate `agent_map_positions(account_id, agent_id, x, y)` table, created on first use. `x` and `y` are a card's centre as fractions (0–1) of the map. They are kept apart from `agent_settings` so dragging a card never bumps a settings `revision` and makes an open settings form fail with 409. The layout is cosmetic, so the last write wins. A save replaces all of the account's rows in one `BEGIN IMMEDIATE` transaction; a reset deletes them. Rows for agents no longer in `AGENTS` are ignored when read.

## Endpoints

| Method | Path | Body |
|---|---|---|
| GET | `/api/team` | — returns `{ agents: [...], layout: { agent_id: { x, y } } }` with each agent's definition and settings and the saved map positions (empty when never arranged) |
| PUT | `/api/team/layout` | `{ positions: { agent_id: { x, y } } }`, at most 20 entries, `x`/`y` finite numbers from 0 to 1. Unknown agents or extra fields return 422. Returns `{ layout }`. |
| DELETE | `/api/team/layout` | — clears the saved positions. Returns `{ layout: {} }`. |
| PUT | `/api/team/{agent_id}` | `{ prompt ≤4,000, data ≤8,000, tools ≤10, revision, brain, delegation }`. `brain` is required. `delegation` (`ask`, `auto` or `off`) is required for agents with `delegates_to` and must be omitted or `null` for the others (422 otherwise). Returns the saved settings with brain statuses. |

## Service functions used by other features

- `settings(account_id, agent_id)`: the merged definition and saved settings
- `require_tool(config, tool)`: raises 403 "This tool is disabled…"
- `context(config)`: formats the owner's instructions and reference data for a system prompt, labelled as unable to grant tools or override limits

Used by `features/operator`, `features/forecasting` and `features/agents`.

## Files

`service.py`, `routes.py` (also brain statuses; the `/layout` routes are registered before `/{agent_id}` so "layout" isn't read as an agent), `tests/test_team.py`.

## Limits and next steps

- Agents are defined in code. There's no manifest, install or uninstall, versioning, or third-party agent support.
- Changes take effect on the next request; nothing is pushed to running sessions.
- This module is the natural place to grow a Catalog registry: replace `AGENTS` with installable manifests and keep the per-account `agent_settings` row as the installation record.
