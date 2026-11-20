# Team (server)

The list of available agents, plus each project's settings for each agent: extra instructions, reference data, which tools are switched on, which brain it uses, which other agents it may ask (links), which runtime tools are on, and where its card sits on the My agents map. It also provides `require_tool()`, the check every capability goes through.

## Agent list (`AGENTS`)

`AGENTS` is built from the files in `server/agents/` (see `server/agents/README.md` and `common/agent_catalog.py`), in their `order`. Each entry exposes only `name`, `description`, `tools` (the file's `capabilities`), `delegates_to` and `available_toolsets`; the persona and the Mula tool list stay on the server.

| Agent | Tools |
|---|---|
| `operator` | `csv_read`, `memory_read`, `memory_write` |
| `forecasting` | `naive`, `moving_average`, `exponential_smoothing`, `seasonal_naive`, `drift`, `explain` |

These are application capabilities that FastAPI checks itself. The model can't call them directly; the agent tools in `features/agents` (such as `calculate_forecast`) check them through `require_tool` before running.

`delegates_to` lists the agents an agent may ever ask (the ceiling for its links): `["forecasting"]` for the Operator and `["operator"]` for Forecasting. The file gives each a default mode (Operator → Forecasting `ask`, Forecasting → Operator `none`).

`available_toolsets` lists the runtime toolsets the file allows (`runtime_toolsets`), from the safe set in `common/agent_catalog.py`: `web`, `vision`, `image_gen`, `todo`, `session_search`. None can reach this computer's files, terminal, browser or desktop. Settings add `runtime_toolsets` (switched on, empty by default), `toolset_tools` (the tool names in each) and `toolset_status`: `web` and `image_gen` are `needs_setup` (no provider key reaches agent profiles, so they can't be switched on), `vision` is `paid` (the runtime's helper model may use paid credits), `todo` and `session_search` are `ready`. Switched-on toolsets are written into the agent's own runtime profile (`common/profiles.py`), so a tool that is off is never offered to the model.

Every agent has a selectable brain from `common/brains.py`. Its settings include `brain` and `available_brains`, where each brain has a `name`, `description`, `location` (`local` or `cloud`) and `status`. The routes fill in `status` from the runtime's `GET /v1/models`: `ready`, `needs_setup` (no route configured), or `unchecked` (runtime unreachable). The default brain is always `ready`.

## Storage

The `agent_settings(account_id, agent_id, prompt, data, tools JSONB, revision, brain, delegation, runtime_toolsets JSONB)` table in the PostgreSQL application database, with primary key `(account_id, agent_id)`; map positions are in `agent_map_positions`. If an account has no saved row, the agent uses an empty prompt and data, with **all tools enabled** and the default brain. `NULL` in `brain`, or a brain no longer in the registry, means the default brain. Links are in `agent_links(project_id, from_agent, to_agent, mode)`; a missing row means the file's default. Migration 0005 copied each saved `delegation` into an Operator → Forecasting link; the `delegation` column is kept as the rollback copy and no longer read.

Saving is atomic: a transaction-scoped advisory lock on the account's agent (`pg_advisory_xact_lock`) serialises saves, including the first one when no row exists yet. The save checks the revision (409 on mismatch), then upserts the row with `revision + 1`. Unknown or duplicate tool names return 422. Links are upserted in the same transaction, under the same lock.

Map positions live in a separate `agent_map_positions(account_id, agent_id, x, y)` table, created on first use. `x` and `y` are a card's centre as fractions (0–1) of the map. They are kept apart from `agent_settings` so dragging a card never bumps a settings `revision` and makes an open settings form fail with 409. The layout is cosmetic, so the last write wins. A save replaces all of the account's rows in one transaction; a reset deletes them. Rows for agents no longer in `AGENTS` are ignored when read.

## Endpoints

| Method | Path | Body |
|---|---|---|
| GET | `/api/team` | — returns `{ agents: [...], layout: { agent_id: { x, y } } }` with each agent's definition and settings and the saved map positions (empty when never arranged) |
| PUT | `/api/team/layout` | `{ positions: { agent_id: { x, y } } }`, at most 20 entries, `x`/`y` finite numbers from 0 to 1. Unknown agents or extra fields return 422. Returns `{ layout }`. |
| DELETE | `/api/team/layout` | — clears the saved positions. Returns `{ layout: {} }`. |
| PUT | `/api/team/{agent_id}` | `{ prompt ≤4,000, data ≤8,000, tools ≤10, revision, brain, links?, runtime_toolsets? }`. `links` maps agent ids to `ask`, `auto`, `off` or `none`; a target outside `delegates_to` returns 422, and one left out keeps its mode. `runtime_toolsets` must come from `available_toolsets`; switching on a `needs_setup` toolset returns 422. Returns the saved settings with brain statuses. |
| GET | `/api/team/{agent_id}/card` | The agent's A2A card (`features/a2a`) |
| GET | `/api/team/tasks?agent=` | The project's agent requests as A2A Tasks (`features/a2a`) |
| GET/POST/DELETE | `/api/team/{agent_id}/client-keys[/{id}]` | Client keys for editors (`features/acp`) |

## Service functions used by other features

- `settings(account_id, agent_id)`: the merged definition and saved settings
- `require_tool(config, tool)`: raises 403 "This tool is disabled…"
- `context(config)`: formats the owner's instructions and reference data for a system prompt, labelled as unable to grant tools or override limits

Used by `features/operator`, `features/forecasting` and `features/agents`.

## Files

`service.py`, `routes.py` (also brain statuses; the `/layout` routes are registered before `/{agent_id}` so "layout" isn't read as an agent), `tests/test_team.py`.

## Limits and next steps

- Agents are defined by files in `server/agents/`, read at startup. There's no install or uninstall, versioning, or third-party agent support, and the web app still allows only `operator` and `forecasting`.
- Changes take effect on the next request; nothing is pushed to running sessions.
- This module is the natural place to grow a Catalog registry: grow the agent files into installable manifests and keep the per-account `agent_settings` row as the installation record.
