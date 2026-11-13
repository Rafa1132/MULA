# Agents (server)

Makes every agent in My agents a Mula agent: each one answers on its own brain, in its own Mula session, with its own persona. It also lets the Operator ask Forecasting for help and lets the owner chat with Forecasting directly.

## How an agent turn runs

1. The backend issues a **ticket** for the turn (`issue_ticket`): a random token whose sha256 hash is stored in `agent_tickets` with the account, the agent, the turn's CSV attachment, the reply's message id and a depth. Tickets expire after 15 minutes (`TICKET_SECONDS`).
2. The ticket goes into that turn's system prompt (`tool_context`), with instructions for the agent's tools. The model passes it as `ticket` on every tool call.
3. Mula sends tool calls to the backend's MCP endpoint at `/mcp` (`tools.py`). The endpoint resolves the ticket to its account and agent, refuses tools that agent may not use (`AGENT_TOOLS`), and checks the owner's tool settings through `team.require_tool`.

MCP calls carry no caller identity, only the shared `MULA_TOOLS_KEY`. The ticket is what scopes a call to one account, one agent and one turn. Only the hash is stored, but the plain ticket appears in Mula's own session log for that turn.

## Tools (`tools.py`)

| Tool | Agent | What it does |
|---|---|---|
| `ask_agent(ticket, agent, question)` | Operator | Records a request to Forecasting (see below) |
| `calculate_forecast(ticket, date_column, value_column, frequency, horizon, method)` | Forecasting | Runs the statistical methods on the turn's CSV, saves the run so it shows in "Run a forecast", and returns a compact report |
| `latest_forecast(ticket)` | Forecasting | The account's most recent saved forecast |

Expected failures (a refused ticket, a disabled method, a bad column) come back to the model as readable tool errors.

## Asking another agent

The Operator's **When Operator needs another agent** setting (`agent_settings.delegation`) has three modes:

- **Ask me first** (`ask`, the default): `ask_agent` saves a pending request. The chat shows it as a card with **Ask Forecasting** and **Not now**.
- **Go ahead** (`auto`): the request is saved as approved in advance, and the client approves it as soon as the Operator's reply ends.
- **Don't ask other agents** (`off`): `ask_agent` is refused and the Operator is told not to call it.

`ask_agent` never runs Forecasting inside the tool call. Mula serves one call at a time per MCP server, so Forecasting's own `calculate_forecast` would wait behind the open `ask_agent` call until it timed out. Approval runs it afterwards instead:

1. `POST /api/agents/requests/{id}/approve` atomically claims the pending request (`start_request`).
2. Forecasting answers as itself, on its own brain, in a Mula session for that request, with the CSV passed on in a new ticket. Requests are one level deep: a ticket issued for Forecasting cannot call `ask_agent`.
3. The Operator relays the answer in the owner's conversation as a new reply, saved with the note "Answer from Forecasting".

A request that is still pending after 24 hours (`REQUEST_SECONDS`) reads as expired. A request whose answer stream ends early (Stop, closed page, runtime error) is marked failed, so it never stays "running".

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/agents/{agent_id}/conversation` | `{ messages }` for the direct chat with that agent; 404 for `operator` |
| POST | `/api/agents/{agent_id}/chat` | `{ message 1–8,000, csv_file? }`, streams NDJSON like the Operator chat. Runs in that agent's own session (`mula-<agent>-…`), separate from the Operator's conversation |
| POST | `/api/agents/requests/{id}/approve` | Streams `request` events (running → answered or failed), then the Operator's relay. 404 for another account's request, 409 when expired or already handled |
| POST | `/api/agents/requests/{id}/decline` | `{ request }` |
| POST | `/mcp/` | MCP tool server for Mula; requires `Authorization: Bearer MULA_TOOLS_KEY` |

The Operator chat (`features/operator`) sends a `request` event for each request made during the turn, before `done`. `GET /api/conversation` returns the Operator's requests as `requests`, each with the `message_id` of the reply that made it.

## Storage

In `accounts.sqlite3`, created on first use:

- `agent_tickets(token_hash, account_id, agent_id, attachment, message_id, depth, expires)`. Expired rows are removed when a new ticket is issued.
- `agent_requests(id, account_id, from_agent, to_agent, question, attachment, ticket_hash, message_id, status, answer, created, approved_in_advance)`.
- `messages.agent_id` (in `features/auth`) keeps direct chats apart from the Operator conversation. Older rows become `operator`.

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
