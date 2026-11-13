# LARAS Operator on Hermes

FastAPI owns Mula's API contract and Operator instructions. A separate, real Hermes gateway owns model execution, its agent loop, persisted conversation history and context compression. Ollama remains the default model provider inside Hermes; FastAPI no longer calls Ollama directly or silently falls back to it.

The HTTP integration follows [Hermes' API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server). Upstream is pinned in `hermes/revision.txt` to `c841bfcd0ad2ca5535589ce1cbcb06d7ac25c7cc`. Upgrade that revision deliberately and rerun the integration checks.

## Setup

Run from the repository root:

```sh
python3 -m venv server/.venv
server/.venv/bin/python -m pip install -r server/requirements-dev.txt
python3 server/scripts/setup_hermes.py
bash server/scripts/install_hermes.sh
```

If the existing backend virtual environment is installed, keep it. `setup_hermes.py` generates matching random server-side credentials in `server/.env.hermes` and `.runtime/hermes/.env`, and copies `server/hermes/config.yaml` into `.runtime/hermes/config.yaml`. It also generates `MULA_TOOLS_KEY`, which Mula uses to call the backend's agent tools at `/mcp` (see "Agent tools"). It never overwrites existing configuration. Credentials and runtime state are ignored by Git; files holding credentials are created with owner-only permissions.

The installer downloads the pinned upstream checkout into `.runtime/hermes-source` and uses its locked dependency installation stage. Hermes manages its own Python and dependencies; they are not added to FastAPI's environment. The script skips browser/computer-use installation and does not install a global launcher or modify shell startup files. The upstream installer can still download its core runtime tools and dependencies.

### Model compatibility

The supplied profile selects `huihui_ai/qwen3-abliterated:latest` through `http://127.0.0.1:11434/v1` with the observed 40,960-token window.

Upstream Hermes enforces a 64,000-token startup minimum. `scripts/apply_hermes_profile.py` applies a small, reproducible exception against the pinned source revision. It allows only the explicitly enabled `agent.mula_compact_operator` API-server profile, the selected Qwen model, windows between 8,192 and 40,960, and at most five tools, all of them Mula's own (`mcp__mula__*`). The same exception covers the check upstream repeats before each request that offers tools (`_ollama_context_limit_error`). Terminal, file, web or any other server's tools, other models and other platforms all keep the upstream check. This is a local modification to Hermes, not an upstream configuration option.

The patch is applied during install and startup. It checks the revision, preserves unrelated edits, and refuses unexpected source changes. Keep using `start_hermes.sh`; launching an unpatched Hermes installation directly will retain the original minimum.

Compression has an absolute trigger of 24,000 tokens and protects the most recent six messages. Summarization can lose details, and compression itself makes model calls; business records must remain in the application database. The 40,960-token window is capacity, not a fixed per-message token charge. Long conversations and compression quality still need workload testing.

If a gateway is already running, reload the profile with:

```sh
bash server/scripts/start_hermes.sh --replace
```

The old direct-Ollama FastAPI environment settings are no longer used.

## Start

After setup, use one command to launch the complete stack:

```sh
bash /Users/rafa/Desktop/LARAS/run.sh
```

The launcher reuses reachable services, starts missing ones, and opens the app. Leave it running; Ctrl+C stops the services it started. Logs live in `.runtime/logs`. Add `--no-open` to skip opening a browser.

### Individual services


In separate terminals, from the repository root:

```sh
# 1. Ollama must already be running and serving the configured model.
# 2. Dedicated Hermes gateway (binds to 127.0.0.1:8642).
bash server/scripts/start_hermes.sh
```

```sh
# 3. Application backend.
cd server
.venv/bin/python -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --env-file .env.hermes
```

```sh
# 4. Existing UI.
# From the repository root
npm run dev
```

If you already have a Hermes gateway elsewhere, set `HERMES_BASE_URL`, `HERMES_API_KEY` (matching its `API_SERVER_KEY`), `HERMES_MODEL` and optional `HERMES_TIMEOUT_SECONDS` using `server/.env.example`. Use a dedicated profile with the same restricted tools policy. A personal Hermes profile may expose terminal/file tools, private memory or unrelated integrations.

## API and continuity

`POST /api/agents/operator/chat` still accepts `message` (1–8,000 non-whitespace characters) and `stream` (default false). It requires an account session cookie. The backend assigns the account’s permanent conversation UUID; an optional `session_id` must match that UUID or the request is refused with 403:

```json
{"message":"My shop is Mula Cafe","session_id":"df2f78e5-abd6-43c2-8b10-145783ac2301","stream":false}
```

Every account has a server-owned UUID reused for every turn. Callers cannot start or read another conversation by changing the ID. Hermes receives a namespaced `X-Hermes-Session-Id` and loads its history. The browser sends only the new question. Relevant history still consumes model input tokens.

JSON responses retain `agent`, `reply`, `model`, and add `session_id` and `truncated`. `model` names the gateway alias of the brain that was used (see below); inspect Hermes config for the underlying inference model.

Streaming remains newline-delimited JSON:

```json
{"type":"session","session_id":"df2f78e5-abd6-43c2-8b10-145783ac2301"}
{"type":"token","content":"Hello"}
{"type":"done","truncated":false}
```

Failures after headers are sent emit `type: error` with a safe `detail` and `status_code`. The adapter translates Hermes SSE, requires a successful terminal status and `[DONE]`, filters reasoning and internal status events, and reports partial/length-limited replies. Unexpected approval requests fail explicitly because this UI does not yet support them.

**Stop** closes the stream through Next.js and FastAPI to Hermes. The pinned gateway interrupts the agent when it detects the closed SSE connection; this is cooperative cancellation, not a rollback of completed work. No business-action tools are enabled here. Interrupted/failed turns may already be in Hermes history; retrying submits a new turn.

The UI reopens the account conversation after login and refresh. There is no New chat button. Application history is persisted in `.runtime/accounts.sqlite3`; Hermes retains its own model transcript. Old chats from before accounts were added are not assigned to a new account automatically.

## Brains (model choice)

Each account chooses each agent's brain in **My agents**; Operator and Forecasting choose separately. The choices are defined in `src/common/brains.py`:

| Brain | Gateway alias | Model |
|---|---|---|
| Qwen (local), the default | `HERMES_MODEL` (`hermes-agent`) | the profile's `model.default`, through Ollama |
| Claude Haiku 5.5 | `mula-claude-haiku` | `claude-haiku-5-5` |
| Claude Sonnet 5.5 | `mula-claude-sonnet` | `claude-sonnet-5-5` |
| Claude Opus 5.5 | `mula-claude-opus` | `claude-opus-5-5` |

The Claude brains are `gateway.api_server.model_routes` entries, so the request's `model` field picks the brain per message without restarting Hermes. Hermes answers an alias it doesn't know with its default model, so before sending a non-default brain the adapter checks `GET /v1/models` and refuses the turn with 409 if the alias is missing. A Claude choice never gets a Qwen reply. Switching brains keeps the same Hermes session and history. The `model.context_length` pin and the compact-profile patch apply only to the default Qwen model; Claude routes use their own context windows and the upstream 64K check. Hermes maps the adapter's "reasoning off" to what each Claude model accepts.

To add the Claude brains, create an API key in the Claude Console, then:

```sh
server/.venv/bin/python server/scripts/enable_claude.py      # prompts for the key; input is hidden
bash server/scripts/start_hermes.sh --replace
```

The script stores `ANTHROPIC_API_KEY` in `.runtime/hermes/.env` and writes the routes into `.runtime/hermes/config.yaml`, both owner-only. It rewrites that private copy with PyYAML, so comments in it are dropped; the template in `hermes/config.yaml` keeps them. Other `model_routes` entries are preserved. `--disable` removes the routes and the key.

Only Console API keys (`sk-ant-api…`) are accepted. Anthropic doesn't allow products to serve their users through Claude Free/Pro/Max subscription credentials. Without an API key, Hermes would fall back to the computer owner's Claude Code login. To prevent that, the script refuses subscription tokens and profiles that define `ANTHROPIC_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`, writes the key before the routes (and removes it after them), and `start_hermes.sh` unsets those two variables from the launching shell. If you delete the key by hand, also run `--disable`.

Claude brains send each message for that agent, with its system prompt, retrieved memory, owner instructions, reference data and attached CSV rows, to Anthropic. Usage is billed per token to the key.

## Agent tools

Every agent is a Mula agent with its own persona, brain and session. Mula gets their business tools from an MCP server inside this backend, mounted at `/mcp` (`src/features/agents/tools.py`): `ask_agent` for the Operator, and `calculate_forecast` and `latest_forecast` for Forecasting. The profile's `mcp_servers.mula` entry calls it with `Authorization: Bearer ${MULA_TOOLS_KEY}`; without the key the endpoint refuses every request. `platform_toolsets.api_server` enables only that server, and `tools.tool_search` is off so the tools reach the model directly, which the small-context exception requires.

Each turn's system prompt carries a ticket that scopes tool calls to one account, agent and turn. The Operator asks Forecasting according to the owner's **When Operator needs another agent** setting (ask first by default); see `src/features/agents/README.md`.

An existing install connects with:

```sh
server/.venv/bin/python server/scripts/connect_agents.py      # --disable disconnects
./run.sh
```

It writes a fresh shared key to `server/.env.hermes` and `.runtime/hermes/.env`, and copies the tool server, toolset and tool search settings from `hermes/config.yaml` into the private profile. Other configured MCP servers are kept, but the API platform only sees Mula's own tools.

## Health

- `GET /health`: application liveness, runtime name and configured gateway alias. Makes no upstream request.
- `GET /ready`: verifies authentication and Hermes chat capabilities. Returns 503 if unavailable/incompatible. It does **not** run model inference or certify the model's context window, throughput or quality.

## Files and extension points

- `src/features/operator/prompts/operator.md`: Operator role and current business limitations.
- `src/features/operator/agent.py`: role entry point, delegating execution to the runtime adapter.
- `src/features/operator/runtime.py`: Hermes HTTP/SSE transport, model-alias check, completion validation and error handling.
- `src/common/brains.py`: the selectable brains and their gateway routes.
- `scripts/enable_claude.py`: adds or removes the Claude brains in the private runtime profile.
- `src/main.py`: Mula API composition, validation-error handling and health checks.
- `src/features/auth/`: account routes and storage, with feature tests.
- `src/features/operator/routes.py`: chat routes and account-owned conversation routing.
- `src/features/agents/`: agent personas, tickets, requests between agents, direct agent chat and the `/mcp` tool server.
- `scripts/connect_agents.py`: connects an existing runtime profile to the agent tools.
- `src/features/voice/`: authenticated speech routes, local TTS service and tests.
- `hermes/config.yaml`: template for the dedicated runtime profile.
- `.runtime/hermes`: private runtime configuration and durable Hermes state (ignored).

Mula runs two agents, Operator and Forecasting. The API platform has only Mula's own tools, the CLI has none, and cross-chat memory is disabled. Upstream delegation, terminal, file and web toolsets stay off; Mula's agents ask each other only through `ask_agent` and the owner's approval setting. Adding Inventory or Procurement requires specialist instructions, scoped business tools and tenant permissions first. Keep business records in the application database rather than treating model memory as the source of truth.

## Checks

```sh
cd server
.venv/bin/python -m unittest discover -s . -t . -v
```

Tests use a simulated Hermes transport and make no model calls. For a live check, start both services, check `/ready`, send a unique fact with a session UUID, ask about it using the same UUID, and verify another UUID does not recall it. Also test Stop during generation. Credentials must stay on the server and out of screenshots/logs.

### Simple accounts

Create an account through the UI with a 3–40 character username and a 10–128 character password. Usernames are case-insensitive. The first version has one workspace per account, with no invitations, password reset or employee roles.

- `POST /api/auth/signup` and `/api/auth/login`: username/password JSON, returning public account information and an HttpOnly, SameSite=Strict cookie.
- `GET /api/auth/me`: current account; 401 if signed out or expired.
- `POST /api/auth/logout`: revokes the session and clears the cookie.
- `GET /api/conversation`: only the signed-in account’s saved chat.

Passwords use salted scrypt hashes. Opaque random sessions are stored as SHA-256 hashes and expire after seven days. Failed login attempts are limited to five per username per 15 minutes. The frontend proxy checks mutation origins and forwards private cookies server-side. Account creation remains open in this local first version.

The SQLite file defaults to `.runtime/accounts.sqlite3`; `LARAS_ACCOUNT_DB` overrides the path. Preserve it to preserve accounts and visible history. Set `LARAS_SECURE_COOKIES=true` when serving through HTTPS. Long-term shared Hermes memory is still disabled: account authentication alone does not isolate a shared Hermes profile’s personal memory.

Live validation after the compact-profile change: Qwen replied through Hermes and a second turn recalled a shop name using the same session UUID. Automated backend checks also verify that tools, other models and other platforms retain the upstream minimum. This validates short conversation execution; it is not a long-context quality or throughput benchmark.

Live validation of agent tools (local Qwen, separate test profile): with "Go ahead", the Operator called `ask_agent` (after first trying `calculate_forecast`, which was refused), Forecasting ran `calculate_forecast` on the uploaded CSV and saved the run, and the Operator relayed matching numbers. The round took about 9½ minutes; the Operator's first tool call alone took close to two.
