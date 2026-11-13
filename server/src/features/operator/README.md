# Operator (server)

The main chat agent. It authorizes each turn, builds the Operator's context (role prompt, memory, owner settings, CSV data) and passes it to the Hermes runtime. It also saves the visible transcript.

## Request flow (`POST /api/agents/operator/chat`)

1. Resolve the account from the cookie and use its permanent `conversation_id`. If the request supplies a different `session_id`, return 403.
2. Load the Operator's settings from `features/team`.
3. **CSV:** if `csv_file` is present, require the `csv_read` tool, parse the file with `prepare_csv`, and append the whole parsed table to the user message, marked as untrusted data.
4. **`/remember`:** if the message starts with `/remember`, require `memory_write`, save the fact through `features/memory`, and add a confirmation line for the model.
5. **Memory retrieval:** if `memory_read` is enabled, retrieve the essential files plus up to 3 keyword matches.
6. Build the system prompt: `prompts/operator.md` + retrieved memory + the owner's extra instructions and reference data + a list of disabled capabilities.
7. Save the user message and an empty assistant placeholder (note: "Reply interrupted.").
8. Send the request to Hermes, either streamed (NDJSON) or as a single reply. The `finally` block always saves whatever text arrived.

`GET /api/conversation` returns `{ session_id, messages }` for the visible history.

## Hermes adapter (`runtime.py`)

- Calls `POST {HERMES_BASE_URL}/v1/chat/completions` with `Authorization: Bearer HERMES_API_KEY` and `X-Hermes-Session-Id: mula-operator-<uuid>`. Without that header, Hermes would identify a conversation by its prompt text and could merge unrelated chats.
- Sends only `[system, latest user message]`. Hermes loads and compresses the earlier history itself.
- Parses server-sent events (comments, CRLF, multi-line data, 1 MB per event), drops reasoning and status events, and yields `token` and `done` events.
- Turns HTTP failures into a `HermesError` with a readable message (auth, 404, busy/409/429, other).
- `chat()` is the non-streaming version, also used by Forecasting's explanation. `check_readiness()` backs `/ready`.

## CSV parsing (`csv_files.py`)

Uses only the Python standard library. Handles a UTF-8 BOM, quoted and multi-line cells, and comma, semicolon, tab or pipe delimiters. Blank headers become `Column N` and duplicates get suffixes like `Sales (2)`. All rows must have the same number of columns. It adds missing-value counts and exact sum/min/max for plain numeric columns.

Limits are **50 KB, 500 rows, 40 columns, 2,000 characters per cell, and 24,000 characters of prepared context**. Files over a limit are rejected, never sampled. The original file isn't stored.

## Files

| File | Purpose |
|---|---|
| `routes.py` | Chat endpoint, streaming wrapper, conversation endpoint |
| `agent.py` | Loads `operator.md` and adds the per-request context |
| `runtime.py` | Hermes HTTP/SSE adapter and `HermesError` |
| `csv_files.py` | `CsvFile` model and `prepare_csv`, shared with Forecasting |
| `prompts/operator.md` | Operator role, limits, and CSV and memory rules |
| `tests/` | `test_operator.py`, `test_streaming.py`, `test_csv.py` (simulated Hermes) |

## Configuration

`HERMES_BASE_URL`, `HERMES_API_KEY`, `HERMES_MODEL` (gateway alias, default `hermes-agent`) and `HERMES_TIMEOUT_SECONDS`, from `server/.env.hermes`. They're checked at import time in `common/config.py`.

## Current limits

- Hermes runs with no tools the model can call, no MCP servers, and its own memory turned off (`server/hermes/config.yaml`). Every capability here is triggered by the application, not chosen by the model.
- There is no delegation to Forecasting or any other agent.
- All accounts share one Hermes profile; conversations are kept apart only by the session header.
- CSV rows live only in Hermes's conversation history and can be lost when Hermes compresses older messages.

See `docs/architecture/mula-harness.md` for the full step-by-step trace.
