# Agents (server)

Makes every agent in My agents a Mula agent: each one answers on its own brain, in its own Mula session, with its own persona. It also lets one agent ask another for help (A2A, see `features/a2a`), lets the owner chat with each agent directly, and serves client turns from editors (ACP, see `features/acp`).

## How an agent turn runs

1. The backend issues a **ticket** for the turn (`issue_ticket`): a random token whose sha256 hash is stored in `agent_tickets` with the account, the agent, the turn's CSV attachment, the reply's message id and a depth. Tickets expire after 15 minutes (`TICKET_SECONDS`).
2. The ticket goes into that turn's system prompt (`tool_context`), with instructions for the agent's tools. The model passes it as `ticket` on every tool call.
3. Mula sends tool calls to the backend's MCP endpoint at `/mcp` (`tools.py`). The endpoint resolves the ticket to its account and agent, refuses tools that agent may not use (`AGENT_TOOLS`, from each file's `runtime_tools` in `server/agents/`), and checks the owner's tool settings through `team.require_tool`.

MCP calls carry no caller identity, only the shared `MULA_TOOLS_KEY`. The ticket is what scopes a call to one project, one agent and one turn. Only the hash is stored, but the plain ticket appears in Mula's own session log for that turn.

## Tools (`tools.py`)

| Tool | Agent | What it does |
|---|---|---|
| `ask_agent(ticket, agent, question)` | Agents with `ask_agent` in `runtime_tools` | Records a request to a connected agent (see below) |
| `calculate_forecast(ticket, date_column, value_column, frequency, horizon, method)` | Forecasting | Runs the statistical methods on the turn's CSV, saves the run so it shows in "Run a forecast", and returns a compact report |
| `latest_forecast(ticket)` | Forecasting | The account's most recent saved forecast |
| `create_project(ticket, name, description?)` | The workspace assistant only | Proposes a project; the owner creates it with a button (`orchestrator/proposals.py`). It takes an assistant ticket, not a project agent's, and agent files can't name it |

Expected failures (a refused ticket, a disabled method, a bad column) come back to the model as readable tool errors.

## Asking another agent

Each pair of agents has a link (`agent_links`, set in My agents → Connections; the file's `delegates_to` is the ceiling and the default). The turn's prompt lists the connected agents and their modes (`link_lines`):

- **Ask me first** (`ask`): `ask_agent` saves a pending request. The chat shows it as a card with **Ask <agent>** and **Not now**.
- **Go ahead** (`auto`): the request is saved as approved in advance, and the client approves it as soon as the asking agent's reply ends.
- **Off** (`off`): connected, but `ask_agent` is refused ("turned off asking") and the agent tells the owner who could help.
- Not connected (`none`): refused with "has not connected".

Each request is stored as an A2A message, and its answer as artifacts, so `GET /api/team/tasks` can show it as a Task (`features/a2a`). Requests work in both chats: the Operator's project chat, and an agent's direct chat in My agents (for example Forecasting asking the Operator).

`ask_agent` never runs Forecasting inside the tool call. Mula serves one call at a time per MCP server, so Forecasting's own `calculate_forecast` would wait behind the open `ask_agent` call until it timed out. Approval runs it afterwards instead:

1. `POST /api/agents/requests/{id}/approve` atomically claims the pending request (`start_request`).
2. The asked agent answers as itself, on its own brain, in a Mula session for that request, with the CSV passed on in a new ticket. Requests are one level deep: a ticket issued for the answer turn cannot call `ask_agent`, and neither can a client (ACP) turn.
3. The asking agent relays the answer in the chat the request came from, as a new reply saved with the note "Answer from <agent>". When Forecasting answered with a forecast, the request's artifacts include its summary.

A request that is still pending after 24 hours (`REQUEST_SECONDS`) reads as expired. A request whose answer stream ends early (Stop, closed page, runtime error) is marked failed, so it never stays "running".

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/agents/{agent_id}/conversation` | `{ messages, requests }` for the direct chat with that agent; 404 for `operator` |
| POST | `/api/agents/{agent_id}/chat` | `{ message 1–8,000, csv_file? }`, streams NDJSON like the Operator chat. Runs in that agent's own session (`mula-<agent>-…`), separate from the Operator's conversation |
| POST | `/api/agents/requests/{id}/approve` | Streams `request` events (running → answered or failed), then the Operator's relay. 404 for another account's request, 409 when expired or already handled |
| POST | `/api/agents/requests/{id}/decline` | `{ request }` |
| POST | `/mcp/` | MCP tool server for Mula; requires `Authorization: Bearer MULA_TOOLS_KEY` |

The Operator chat (`features/operator`) sends a `request` event for each request made during the turn, before `done`. `GET /api/conversation` returns the Operator's requests as `requests`, each with the `message_id` of the reply that made it.

## Storage

In the PostgreSQL application database (`server/migrations`):

- `agent_tickets(token_hash, account_id, agent_id, attachment JSONB, message_id, depth, expires)`. Expired rows are removed when a new ticket is issued.
- `agent_requests(id, account_id, from_agent, to_agent, question, attachment JSONB, ticket_hash, message_id, status, answer, created, approved_in_advance BOOLEAN)`. Approving or declining locks the row (`SELECT … FOR UPDATE`), so only one approval can start a request.
- `messages.agent_id` (in `features/auth`) keeps direct chats apart from the Operator conversation. Rows written without it are `operator`.

## Files

| File | Purpose |
|---|---|
| `service.py` | Personas, tickets, requests, prompts and `answer_as` |
| `tools.py` | MCP tool server and the `/mcp` gateway (key check, lifespan) |
| `routes.py` | Direct chat, approve and decline |
| `tests/test_agents.py` | Tickets, tools, delegation modes, approval, direct chat and the tool server (simulated runtime) |

## Limits

- Only the Operator asks, and only Forecasting. Every request is one level deep.
- Toolsets are set per platform in Mula, so every agent sees all three tool schemas. The backend refuses tools an agent may not use, and local Qwen sometimes tries one before correcting itself.
- With local Qwen a full "ask, calculate, relay" round took about 9½ minutes in a live check.
