# A2A (server)

The written contract for one Mula agent asking another. It follows the shapes of the A2A protocol at a pinned version (`PROTOCOL_VERSION = "0.3.0"`): agent cards, messages made of parts, tasks with a state, and artifacts. It is **in-process only**. There is no network listener, so no outside agent can reach a Mula agent this way and Mula agents can't reach outside ones.

## What's here

| File | What it does |
|---|---|
| `schema.py` | Pydantic models (`AgentCard`, `AgentSkill`, `Message`, `TextPart`, `DataPart`, `Task`, `TaskStatus`, `Artifact`). All refuse unknown fields; `.wire()` gives the camelCase JSON the spec uses. |
| `cards.py` | `card_for(agent_id)` builds a card from the agent's file (`common/agent_catalog.py`): skills from `capabilities`, version from the file's hash. The address is `mula://agents/<id>`, a name and not a URL anyone can call. |
| `tasks.py` | Turns an `agent_requests` row into a Task. `request_message` is the question as a Message; `answer_artifacts` is the answer as a text part, plus a data part with the forecast summary when Forecasting ran one. |
| `routes.py` | `GET /api/team/{agent_id}/card` and `GET /api/team/tasks?agent=` (the project's requests as Tasks, newest first). Both are project-scoped like the rest of `/api/team`. |

## State

The stored `status` stays the truth; the A2A state is derived from it, so the existing chat keeps working unchanged:

| `status` | A2A state |
|---|---|
| pending | `auth-required` (waiting for the owner), or `submitted` when the link is *Go ahead* |
| running | `working` |
| answered | `completed` |
| declined | `rejected` |
| failed | `failed` |
| expired | `canceled` |

Requests made before migration 0005 have no stored message; their Task is rebuilt from the question text.

## Links

Who may ask whom lives in `agent_links(project_id, from_agent, to_agent, mode)` and is edited in My agents → Connections (`team.save`). An agent file's `delegates_to` is the ceiling, with a default mode per target; the server refuses a link outside it. Modes: `ask` (wait for the owner), `auto` (go ahead), `off` (connected but never asks) and `none` (not connected). Requests stay one level deep, so a delegated turn can never ask again.

## Limits

- The task's status timestamp is the request's creation time, not the last change.
- If two requests to Forecasting run at the same moment, the forecast attached to each is the latest run since that request started, so one may carry the other's.

## Tests

`tests/test_a2a.py`: cards, wire shapes, state mapping, artifacts, legacy rows and the routes.
