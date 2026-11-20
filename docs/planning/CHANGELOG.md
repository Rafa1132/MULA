# Mula change history

Dates use Asia/Jakarta. Entries before 13 November 2026 are condensed. Each entry names its author.

## 20 November 2026 — Inventory and Add agent (Muhammad Rafandi, with Claude)

Request: a workspace Inventory (tools, skills, connectors, models) and an Add agent flow on My agents that picks only from it, with correlation rules, validation and tests. Scope chosen: front end plus a service seam, no server changes.

Changed:
- **Inventory** (`src/features/inventory`, `/projects/<id>/inventory`, in the sidebar): built from `/api/team` (tools, runtime toolsets, brains as models) behind `listInventory()`, with labelled samples for skills and connectors, which Mula doesn't have yet. Search, type and status filters, empty states, and `?item=` deep links from the form.
- **My agents:** an Add agent button, a Map/List switch (the list is a grid of cards from the same data), and the Add agent form in the side panel: name (required, unique), description, role with suggestions, tools and skills from the inventory (unusable ones disabled with Set up), the default model preselected, per-tool owner approval (on by default for tools that send messages, move money or change data), hand-offs and instructions with a count. Inline errors, focus on the first error, a toast on create, and a warning on unsaved changes. Added agents are kept in this browser per project (`services/workspaceAgents.ts`) and Mula doesn't run them yet; `features/team/README.md` explains how to connect them to the server.
- **Correlation rules:** agents only reference items in their own workspace; a removed or broken item gives the agent a *Check inventory* badge and never deletes it; deleting an agent never touches the inventory.
- Inter Tight (`common/styles/fonts.ts`) for the new UI; buttons are ink, never mint.
- Fixed in passing: the agent side panel was `100vw` wide, so with a classic scrollbar it ran 15 px off the left edge; it is now `100%`.
- Tests: `inventory.test.mjs`, `correlation.test.mjs`, `agentForm.test.mjs`, `workspaceAgents.test.mjs`, `agentCards.test.mjs`. Checked in the browser on the local dev server (test account) at desktop and at 360 px.

## 20 November 2026 — Project chat fits the window (Muhammad Rafandi, with Claude)

Request: the project chat's viewport height was wrong.

Cause: the project chat's `.app-shell` was `100dvh` tall with a 620 px floor (540 px on phones), so any shorter window (a laptop with devtools or the dock open, a short phone) made the whole page scroll and pushed the composer below the fold. Its single grid row was `auto`, so a sidebar taller than the window could stretch the page too.

Changed:
- `.app-shell` is exactly one window tall (`100dvh`, with `100vh` as the fallback), has no pixel floor, and has a `minmax(0, 1fr)` row; the project sidebar scrolls on its own if it is taller than the window.
- `orbSizeFor` also leaves room for the rest of the screen (380 px), so the orb shrinks on windows under ~540 px, down to the 64 px badge size. Taller windows are unchanged.
- Checked in the browser with a test page at 1440×900, 1280×600, 1280×540, 1280×480, 375×812 and 375×500: no page scroll and the composer stays on screen (before: 1280×600, 1280×480 and 375×500 scrolled). A phone held sideways (375 px tall) still scrolls; Expand chat makes it fit.

## 20 November 2026 — My agents map: no overlaps, whole-card drag, no satellites (Muhammad Rafandi, with Claude)

Request: fix three problems on the agent map: cards overlapping, clicking the mascot moving the image instead of the card, and the orbiting satellite around each agent.

Causes: nothing compared a card's position with the others (and the fallback diagonal for agents without a default placed cards 240 px apart, less than a card's 232 px plus a gap). The bubble bots are `<img>` elements, which browsers drag natively; that drag showed a ghost of the image and cancelled the card's own pointer drag. The satellite was one spinning group in each bot SVG.

Changed:
- **No overlaps:** a 24 px minimum gap. On drop, a card moves to the nearest free spot (ring search, kept inside the world); the starting layout and newly added agents are settled the same way, keeping saved positions where they're clear. Keyboard moves settle when their save fires. Connectors follow. Opening the page doesn't save a settled layout.
- **Whole-card drag:** the bot image is `draggable="false"` and ignores pointer events inside the card, and the card blocks `dragstart`. The existing 5 px click threshold, zoom-aware dragging, touch and pinch handling are unchanged.
- **No satellites:** removed from the four bubble bots (finance, sales, inventory, support) in `public/agents/` and the design handoff, with their unused spin keyframes and the tokens' `satellite` keys. Float, blink, eye glance and reduced motion are unchanged. The art spec now says agents have no satellite. The orchestrator SVG's rings were left as they are (the app shows the voice orb instead).

Checked: `npm test` 172 pass (new overlap tests in `map.test.mjs`, new `mascots.test.mjs`); `npm run typecheck` passes. There is no lint script, so lint wasn't run. The Sales bot was checked in the browser: four animations, nothing outside the box. `map.browser.spec.mjs` gained a mascot-drag and drop-on-a-card step but wasn't run (Playwright isn't installed here).

## 20 November 2026 — The voice orb for the orchestrator (Muhammad Rafandi, with Claude)

Request: "https://github.com/imuvrays1/voice-orb copy this orb design into our orchestrator".

Changed:
- **The orchestrator wears the voice orb** by UV (MIT): a WebGL2 shader ball with a painted colour field, a small fluid the voice stirs, rings and a rim highlight. It replaces `AgentOrb` in both chats (`ChatStage`) and on the Operator's card on My agents (`AgentAvatar`), through `OrchestratorOrb`, which keeps the same props. It is mint, the orchestrator ramp from the agent art tokens. Idle, listening, thinking and speaking map to the orb's ready, listening, connecting and talking; speaking follows the playback analyser.
- The copied files live in `src/features/orb/voice/` and `components/VoiceOrb.tsx`. Each keeps its copyright notice, with `voice/LICENSE` beside them, and notes what was changed: no conditional expressions, plain fields instead of parameter properties, plain CSS, and the artwork type, the demo page's copy and the extra audio helpers left out. No image assets or dependencies were added; the repository's demo mp3 was not copied.
- `AgentOrb` is kept and still shown on `/orb`, under the new orb.

Checked: `npm test` 166 pass (new `orb/tests/voiceOrb.test.mjs`); `npm run typecheck` passes. On `/orb` in a dev preview the orb renders with WebGL2 (no fallback, no shader errors) and its pixels change over time while speaking. Not checked: the chats and My agents in a browser (they need a signed-in backend), and the frame rate with the browser pane in the foreground.

## 20 November 2026 — A2A connections, ACP client access and runtime tools in My agents (Muhammad Rafandi, with Claude)

Request: "create and establish A2A connections with the ACP as well … part of the configuration when I entered the My Agents page", and "enable all Hermes tools and enable essentially my agents to be able to use that tools". Chosen: the safe tool set only (no host access), ACP as the Agent Client Protocol (editors connect to a Mula agent), and A2A between Mula agents only.

Changed:
- **A2A between Mula agents** (`server/src/features/a2a`). Requests are stored as A2A 0.3.0 messages with task states and artifacts. Each agent has a generated card (`GET /api/team/{agent}/card`), and `GET /api/team/tasks` lists requests as Tasks. In-process only; nothing listens on the network.
- **Configurable links.** `agent_links` per project replaces the Operator-only `delegation` setting, with *Ask me first*, *Go ahead*, *Off* or not connected per pair. Agent files declare who they may ask as a mapping with default modes (`delegates_to`), which is also the ceiling. Forecasting may now ask the Operator (not connected by default), and its direct chat in My agents shows request cards with approve and decline. Requests stay one level deep.
- **ACP client access** (`server/src/features/acp`, `server/scripts/mula_acp.py`). Per-agent client keys (shown once, stored hashed, revocable, at most 10) let Zed, VS Code or JetBrains talk to an agent over stdio. Client turns use the agent's settings and memory in their own session, are saved with a note, and can't ask other agents. My agents → Advanced → Client access makes the keys and gives a copy-ready Zed entry.
- **Runtime tools.** Each agent can switch on safe runtime toolsets: web search/extract, vision, image generation, todo and session search. Everything starts off. Each non-Operator agent now has its own runtime profile (`mula-<project>-<agent>`; the Operator keeps `mula-<project>`), so the switches are enforced by the profile. Web and image generation show *Needs setup* (no provider key reaches agent profiles) and can't be switched on; vision is marked *May use paid credits*. The local-context runtime patch now admits these tools' names, at most 12 tools in all.
- Migration `0005_a2a_acp_tools`: `agent_links` (copied from saved `delegation`), `agent_requests.context_id/message/artifacts`, `agent_settings.runtime_toolsets`, `client_keys`.
- The My agents map draws lines from saved links (Off is dashed). Unsaved connection changes no longer redraw the map, and the localStorage connections prototype is gone.

Checked: backend 257 tests pass (new `a2a/tests/test_a2a.py` and `acp/tests/test_acp.py`, plus link, toolset, profile, migration and patch tests); `npm test` 161 pass (new `clientAccess.test.mjs`; the old localStorage tests were replaced); `npm run typecheck` passes. A dry run of the runtime patch against the pinned source shows it applies. The browser specs were updated for links but not run, because Playwright isn't installed here. Not checked live: the running backend predates these changes, so nothing was tried against a real runtime or model.

## 20 November 2026 — One chat everywhere, and the new agent art (Muhammad Rafandi, with Claude)

Request: the agent art handoff "will be the art direction from now on, change the orchestrator avatar to be the new orb", and "the chat in the workspace and inside a project should look and behave the same. also the orb inside the project workspace isnt updated". Chosen: the workspace look for both chats; the orb for the Operator and the Finance bot for Forecasting.

Changed:
- **One chat screen** (`src/features/chat`) for the workspace assistant and every project's Operator. It is black, with the agent's name above the new orb, a status line, Mute, Expand chat, speech bubbles with Markdown, Play reply, and one composer (mic, live conversation, voice options, Send/Stop). Mute is one shared setting (`mula.voice-muted`).
  - **Workspace gains:** Markdown, spoken replies, the mic, live conversation, suggestions and Stop.
  - **Project chat gains:** the new orb (in place of the orange `OperatorCore`, which is kept but unused), and the workspace's look.
  - The project-only parts (streaming, CSV, agent requests) and the workspace-only parts (the entrance, the spoken welcome, onboarding, proposals) stay in their features.
- **Agent art:** the handoff is in `docs/design/agent-art/`. On My agents the Operator is the animated orb and Forecasting the Finance bubble bot (`public/agents/`, shown as images). Agents with the ids finance, sales, inventory or support get their bot; others show their initial. The pixel art is retired. The chat screen's accent is the brand mint.
- Not applied yet: the brief's brand colours and fonts and its My Team layout.

Checked: `npm test` 162 pass (including the new `chat.test.mjs` and `avatar.test.mjs`); `npm run typecheck` passes; there is no lint script. Browser checks with the API faked pass: workspace entry, workspace projects, voice (project composer), team map and panel, landing and orb. Not run: the onboarding, project-request and live-conversation checks, which need a running backend with the new code (the live one also predates projects and needs updating). No backend code changed.

## 20 November 2026 — The workspace entry around the orb (Muhammad Rafandi, with Claude)

Request: "Rework the workspace entry experience around the Operator orb", with naming the assistant and letting it create projects; approved with "lets do the new orb, but keep the old one stashed somewhere, keep say for now".

Changed:
- **One vertical page.** `/workspace` opens on a full-height black screen: the assistant's name, the new orb, its chat underneath and **Your projects ↓**; the projects follow below in one column. The orb fades and grows in over about 2 s, then the chat appears (0.5 s on a reload in the same session, at once under reduced motion). `OperatorCore` (the old orb) is unchanged and still used on project pages.
- **Spoken welcome for new accounts.** **Tap to begin** (or the orb) plays a fixed welcome made once with `say` and cached (`GET /api/speech/welcome`, `server/scripts/generate_welcome_audio.py`); the orb reacts to it and the same words are the first chat line. **Start without sound**, a remembered **Mute**, and a text fallback when voice is off (`MULA_SPEECH_PROVIDER=off`). It plays once per account; existing accounts count as having heard it.
- **Naming the assistant.** The first onboarding question is "What would you like to call me?" (optional; "Operator" otherwise). The name goes into its `SOUL.md`, above the orb and on its chat lines; Settings → Your assistant changes it.
- **The assistant can propose projects.** A new Mula tool, `create_project`, served only to the assistant with an account-scoped ticket and gated by `require_tool`. It records a proposal; the project is created only when the owner presses **Create project** on the card under the reply, and its card then appears in the workspace. Settings can switch this off. Projects gain an optional description, and a workspace holds up to 20 projects, checked under a row lock on both paths.
- Migration `0004_entry_experience`. Both runtime templates list `create_project` in `tools.include`.

Checked: backend 221 tests pass (including the new `orchestrator/tests/test_entry.py`); `npm test` 158 pass; `npm run typecheck` passes; there is no lint script. Browser checks that fake the API pass: the new entry check (`workspace/tests/entry.browser.spec.mjs`), workspace, landing and orb. The onboarding check against a running backend was updated but not run, because the backend running at the time was started before these changes.

## 20 November 2026 — Agent orb and the new logo (Muhammad Rafandi, with Claude)

Request: "this the new logo. change it", then a reusable animated agent orb with four states, audio reactivity, a demo page and a note for the My Team map.

Changed:
- **New logo.** The wordmark is two transparent masks (`public/mula-wordmark.png`, `public/mula-star.png`) that `MulaLogo` paints with the theme's ink and the brand green (`#79e9b3`), so it reads on both themes. The app icon is now the favicon (`src/app/icon.png`) and the touch icon (`src/app/apple-icon.png`). The old orange `public/mula-logo.png` is removed. The accent colour is still the old orange.
- **Agent orb** (`src/features/orb/`): one canvas and one `requestAnimationFrame` loop. It has `idle`, `listening`, `thinking` and `speaking` states eased over about 300 ms, a level from a prop, a `MediaStream` or an `AnalyserNode` smoothed by an exponential moving average, and a sine stand-in when no audio is given. It pauses when hidden or off screen and shows a still orb under reduced motion. The demo is at `/orb`. It is not on the Team map yet; the feature README says how to add it.

Checked: `npm test` (including 10 new orb tests), `npm run typecheck`, and the orb browser check (`src/features/orb/tests/browser.spec.mjs`, 61 fps with eight orbs). The landing page logo was checked by eye in both themes. There is no lint script.

## 19 November 2026 — Onboarding and the workspace assistant (Muhammad Rafandi, with Claude)

Request: stage 3 of the new-user flow, with the approved changes: "Use scripted onboarding with fixed questions … the orchestrator reads those summaries only for projects the user can access. Leave search for later."

Changed:
- **Scripted onboarding** in the workspace assistant's chat: name, business, what to help with, how to answer, one at a time, each skippable, with **Skip for now** for all. Answers go to the account's `USER.md` (`.runtime/users/<account>/USER.md`, owner-only) as they are given; credentials, ID and card numbers, emails and phone numbers are refused. A summary with Edit, then an optional personality (tone, formality, English or Bahasa Indonesia, emoji). Runs once; `/settings` edits the profile and personality and restarts it.
- **Orchestrator** in a runtime profile of its own (uuid5 of the account), with `SOUL.md` rendered from the personality on every turn. Its prompt carries `USER.md` and the memory summary of each project the account can open, with a project's owner facts only for its owner. Migration `0003_orchestrator`.
- **Differs from the plan:** the project summaries are put into the orchestrator's prompt on the server, after the membership check, instead of being tools the model calls.

Evidence: database backed up before 0003. Backend 205 tests pass (9 new); `npm test` 137 pass; typecheck passes; no lint script. The onboarding browser check passes end to end against the running backend. One real orchestrator turn on local Qwen answered in Bahasa Indonesia with the name and business from `USER.md` (about 20 s).

## 19 November 2026 — Landing page, simple sign-in, workspace and projects (Muhammad Rafandi, with Claude)

Request: build Mula's new-user flow (landing page, login/register, a workspace above projects, chat onboarding), in stages. This entry covers stages 1 and 2; onboarding and the global assistant follow.

Changed:
- **Landing and accounts.** `/` is a public landing page (facts not yet known are marked [PLACEHOLDER]); `/login` and `/register` go to `/workspace`. `MULA_RELAXED_AUTH=true` (set only by the dev launcher) accepts any non-empty username and password, still hashed; the backend refuses to start with it while secure cookies are on, so production keeps the strict rules.
- **Projects.** Migration `0002_workspaces_projects` adds workspaces, projects and their members, and renames `account_id` to `project_id` in the six business tables. Every existing account became a workspace with one project whose id is the account id, so its chat, memory folder and runtime profile carried over unmoved. `current_project` checks the `X-Mula-Project` header against membership (400 without it, 404 for a project the account can't open).
- **Pages.** `/workspace` lists projects (Untitled until named; rename; new project; Coming soon placeholders for teammates and GitHub). Project pages moved under `/projects/<id>/`, with the project's name and a switcher at the top-left; old addresses open the first project. My apps and To-do browser storage is per project.

Evidence: the application database was backed up with `pg_dump` before the migration ran; afterwards it held 1 account, 1 workspace and 1 project with the account's id, with all 142 messages and the other rows attached. Backend suite 196 tests pass; `npm test` 135 pass; typecheck passes; no lint script is configured. Browser checks pass for landing, workspace, memory, catalogue (two), apps, To-do, voice and the team map and panel. The team and project-chat checks need a stand-in runtime; against the real stack they pass up to the first scripted model reply.

## 14 November 2026 — Agents are defined by files in server/agents/ (Muhammad Rafandi, with Claude)

Request: "there should be an agent folder", so agent configuration lives in readable files rather than in code or the database.

Changed:
- **Agent folder.** `server/agents/operator.md` and `forecasting.md` hold each agent's name, description, display order, owner-toggleable capabilities, Mula tools and delegation targets as YAML front matter, with the persona as the body. The personas moved unchanged from `features/operator/prompts/` and `features/forecasting/prompts/`, which are gone.
- **Loader.** `src/common/agent_catalog.py` reads the folder once at startup and refuses a broken file with its name: missing or unknown keys, unknown Mula tools, delegation to an agent without a file or without `ask_agent`, an empty persona. `team.AGENTS`, the agents feature's `PERSONAS` and `AGENT_TOOLS`, and the Operator's prompt now come from it. The API shape of `/api/team` is unchanged and still hides the persona.
- **Unchanged on purpose.** Owner settings stay per account in the database. The per-turn tool instructions in `agents/service.py::tool_context` stay in code because they describe how each tool behaves. The web app's agent allowlists stay, so a new agent file needs frontend work before owners can use it.

Evidence: both personas loaded from the new files compared byte-identical to the old prompt files before those were removed. The backend suite passes (169 tests, including 10 new loader tests, one of which checks that the known Mula tools match the tool server).

## 14 November 2026 — The application database moves to PostgreSQL (Muhammad Rafandi, with Claude)

Request: move Mula's primary database from `.runtime/accounts.sqlite3` to PostgreSQL with behaviour unchanged and the data intact. Decisions (approved plan): psycopg 3 with a pool and raw SQL, Alembic for the schema; the per-account memory stores stay SQLite for now; no SQLite fallback in the backend or the tests.

Changed:
- **Data access.** `src/common/database.py` holds the pool; `database()` keeps its shape: one transaction per block, rows as dicts. `MULA_DATABASE_URL` is required, and `MULA_DATABASE_SCHEMA` exists for tests and rehearsals. The per-module `CREATE TABLE IF NOT EXISTS`, `PRAGMA table_info` and `ALTER TABLE` code is gone.
- **Schema.** `migrations/versions/0001_initial.py` holds the nine tables in PostgreSQL types. `messages.id`, `forecast_runs.seq` and `agent_requests.seq` are identity columns; the two `seq` columns keep insertion order, which SQLite gave through its hidden rowid. The JSON text columns are JSONB. `approved_in_advance` is a boolean, `forecast_runs.created_at` is a timestamp with time zone, and `accounts.created_at` is new. Epoch-second columns stay integers. The backend migrates at startup.
- **Locking.** SQLite's database-wide `BEGIN IMMEDIATE` became narrower locks. Settings saves take a transaction-scoped advisory lock per account and agent. Request approvals and declines take `SELECT … FOR UPDATE`.
- **Copy.** `scripts/migrate_sqlite_to_postgres.py` does a dry run by default and opens the file read-only. It copies in one transaction with message ids kept, then compares row counts. It refuses to write into a non-empty target without `--replace`, and it skips the leftover `memory_*` tables.
- **Local development.** `docker-compose.yml` defines a `postgres:17` service whose credentials sit in an ignored `.env.postgres`. `./run.sh` reuses a running PostgreSQL, starts the compose service when Docker is present, and otherwise says what to do. `setup_hermes.py` writes `MULA_DATABASE_URL`.
- **Memory folder.** The memory folder no longer derives from the database path; `MULA_DATA_DIR` (default `.runtime`) sets it.
- **Tests.** Each test runs in its own throwaway schema in `MULA_TEST_DATABASE_URL`. New tests cover the schema, concurrency (one winner for a settings save and for a request claim, distinct message ids) and the copy script (counts, types, id preservation, refusal, `--replace`, mismatch exit, source unchanged). The setup test now covers the database URL and the compose password.

Evidence: the backend suite passes against PostgreSQL 17 (159 tests, each in its own schema). A rehearsal copied a snapshot of the real file into a scratch schema. The real copy then went into `mula` with the stack stopped. Row counts matched on both sides: accounts 1, sessions 1, messages 102, agent_settings 1, agent_map_positions 2, agent_tickets 5, and 0 for the other three tables. A per-table content fingerprint was identical for every table. The SQLite file's hash was unchanged, and the next message id continues at 103. After the restart, the live backend answered from PostgreSQL and no longer opened the SQLite file, and the server log was clean.

Also during the restart: the runtime's generated launchers (`.runtime/hermes-source/.hermes/bin/hermes`, `hermes-acp`) reached the bundled Python through `LARAS/backend/..`. A `backend` folder had existed only as a leftover and was gone, so the runtime could not start. Both launchers now use the equivalent `LARAS/.runtime/...` path; copies of the originals were kept outside the repo. A reinstall with `install_hermes.sh` would regenerate them correctly.

Open: the memory stores and the runtime's own `state.db` stay SQLite. After the copy was verified, the owner had `.runtime/accounts.sqlite3` deleted; PostgreSQL is now the only copy, so back it up with `pg_dump`.

## 14 November 2026 — One runtime profile per account, and a memory Mula owns (Muhammad Rafandi, with Claude)

Request: give each account its own runtime profile so `MEMORY.md`/`USER.md` are never shared; let Mula own the whole memory store (append-only, timestamped, per account) and decide what gets saved; regenerate `MEMORY.md` as a short summary that the agent never edits. Decision: "Hermes behaviour, Mula storage": the Operator saves on its own with a `remember` tool and gets the memory back every turn, with no approval cards; the storage, the filtering and the history are Mula's.

Changed:
- **Profiles.** The root runtime config turns on `gateway.multiplex_profiles`. `src/common/profiles.py` derives a profile name (`mula-<account>`) and an API key (HMAC of the account id with `MULA_PROFILE_KEY_SEED`) per account, writes `.runtime/hermes/profiles/<name>/` from `hermes/profile.config.yaml` (memory off, Mula's tools only) with the profile's own `.env`, and the runtime adapter sends every turn to `/p/<name>/v1/chat/completions` with that key. A profile accepts only its own key. Profiles are written on signup; `scripts/provision_profiles.py --apply` provisions existing accounts (dry run by default), and `connect_agents.py` / `enable_claude.py` refresh the profiles' mirrored secrets. The backend refuses to start if any profile has the runtime's memory on.
- **Serving a new profile.** The gateway discovers a new profile folder only on its 30-second rescan, and a turn before that fails inside the gateway with `profile_mismatch` (seen live). `src/common/runtime_control.py` speaks the gateway's control-socket protocol: signup asks for a `rescan-profiles`, and `profiles.ensure_served` checks the gateway's recorded served list before every turn, asks for a rescan when the profile is missing, and refuses the turn with a retry message only when a running gateway still does not serve it. A profile is written only after its key is derived, so a missing seed leaves nothing on disk.
- **Store.** `.runtime/workspaces/<account>/memory/store.sqlite3`: one fact per row with target (business/owner), actor, timestamps and supersession fields; SQLite triggers forbid delete and rewrite, and allow supersession once. An append-only audit table records every save, correction, retirement, duplicate and refusal with ids and hashes only.
- **Pipeline.** `pipeline.remember` validates (3–500 characters, no control characters), refuses credentials, keys, card and identity numbers and other people's contact details, reports near-duplicates (Jaccard ≥ 0.8) instead of saving twice, commits, marks a replaced fact superseded, audits and regenerates the summary. Overlapping facts (≥ 0.5) are kept and flagged on the Memory page.
- **Summary and prompt.** `MEMORY.md` is regenerated from the store: current facts only, newest first, within the runtime's own 2,200/1,375-character limits. The Operator's system prompt carries the summary plus up to three keyword-matched facts; superseded facts never reach a prompt. The Operator prompt explains when to save, how to correct, and what never to save.
- **Tool and commands.** `remember(ticket, target, fact, replaces?)` on the `/mcp` server, Operator only and gated by the owner's memory setting. `/remember fact` and `/remember owner | fact` go through the same pipeline. The reply's note shows `Saved to memory: [id]` when the Operator saved during a turn.
- **Memory page.** Two timelines (business, owner) with Add, Correct (inline; the old version moves to History) and Retire, the regenerated summary, retrieval test, last retrieval and the audit tail. New proxies for the entry routes.
- **Migration.** `scripts/migrate_memory_entries.py` (dry run by default) imports the old Markdown paragraphs through the pipeline; preferences and fun facts become owner facts, `decisions/superseded.md` is imported and retired. The files are left byte-identical and the old `memory_*` tables stay.

Evidence: backend tests (146, including profile derivation and files, cross-profile key refusal against a stub that mirrors the runtime's rule, no-seed refusal with nothing written, the control-socket rescan against a fake gateway socket (direct and pointer file, served, pending, refused, no gateway), append-only triggers, pipeline dedupe/refusal/audit, summary limits, startup check, both scripts' dry runs and applies) pass; frontend tests and type check pass; the new Memory page browser spec and the workspace spec pass against the isolated copy. A throwaway multiplexed gateway at the pinned revision (separate home and port, the user's gateway untouched) served a profile written by `profiles.ensure_profile`: `/p/<name>/v1/models` answered 200 with the derived key, 401 with the root key, the root path answered 401 with the profile key, and an unknown profile 404. Live, with the same throwaway gateway, an isolated backend and local Qwen: a fresh signup's first message ("Please remember this: our coffee supplier is Aroma, and deliveries arrive every Tuesday.") made the Operator call `remember`; the store got entry [1] with actor `operator`, the reply note read `Saved to memory: [1]`, and the next question was answered from memory with the citation `[1]` and the note `Memory used: [1]`. The gateway log shows both profiles served with reason `control-socket`, right after signup.

Open: with local Qwen a turn that saves took about three minutes and the recall turn over a minute, so the live check covers one save and one recall, not many shapes of request. Each account profile holds a copy of the shared secrets. The sensitive-data filter is a pattern list. What the Operator chooses to save depends on the model. An installation that runs this code before `provision_profiles.py --apply` gets a 503 ("not set up") on every turn until the seed exists; the half-written profile folder that an earlier version left behind in that case is completed by the provisioning run.

## 14 November 2026 — A quieter look: light and dark, one dawn accent (Muhammad Rafandi, with Claude)

Request: repurpose the whole UI toward an elegant, minimal design in the spirit of ElevenLabs' interface, with quiet motion, and make everything feel expensive. Decisions: light and dark both supported; the Mula logo kept as it is and its orange kept as a "dawn" accent; the composer keeps only the microphone and a compact live-conversation button visible, with the rest in a menu; the desk panel goes and suggestions move inline; copy is stripped to the welcome line and the status line; hover and press on every control, fewer lines and more space, and a bundled typeface.

Changed:
- One set of colour tokens in `globals.css`: light by default, dark through `prefers-color-scheme`. Mostly monochrome, with the orange reserved for the logo, the Operator core and its halo, the status dot, links, the map arrow and selected states. Primary buttons are ink on background. Every page, the forecast chart and the Operator core draw from the tokens; the My agents page no longer carries its own dark palette.
- Lines gave way to space: cards use a soft shadow (`--shadow`) and an invisible edge that becomes faint in dark mode (`--edge`); message dividers, the sidebar rule and the conversation heading rule are gone. Geist is bundled through `next/font`.
- Workspace: the right-hand desk panel is removed and its three suggestions appear as chips under an empty conversation. The eyebrow, sidebar taglines, "YOU & MULA" heading, preview badge, footer notes and mode line are gone. The composer is one pill: **+** (CSV), message, microphone, live-conversation button, a **Voice options** menu (Chat/Voice, speech language) and send. Hints show only while they apply. The attached CSV floats above the pill as a chip.
- Motion: every control eases the same way, lifts on hover and settles on press; messages fade in; text shimmers while something is being prepared; the status dot pulses while audio is live. Reduced-motion preferences turn it all off and keep the text readable.
- The logo PNG has a transparent background instead of the baked-in black, so it sits on a light page. Same shapes, same orange.
- Browser specs: the team spec checks the light and dark page background; the dictation spec opens the voice options menu before choosing a language. Button labels for live conversation and dictation are unchanged.

Evidence: frontend tests (46) pass, type check is clean, and the workspace, team and dictation browser specs pass against the isolated copy. Screenshots of every page were checked in light and dark at 1440px and 390px, including the composer with a file attached and the menu open. No backend change.

Open: the live-conversation browser spec needs real TTS and was not run. There is no in-app theme switch, only the device setting. The first build needs network access to fetch the typeface.

## 14 November 2026 — Every agent is a Mula agent; Operator can ask Forecasting (Muhammad Rafandi, with Claude)

Request: every agent should be an LLM agent running on Mula, and the Operator should be connected to Forecasting. Decisions: local Qwen may run Mula's own tools below the upstream 64K context minimum; asking another agent is a setting whose default is "ask the owner first"; the owner talks through the Operator but can also chat with an agent directly in My agents.

Changed:
- Forecasting is now a Mula agent with its own persona, brain choice and session. Its numbers still come only from the statistical methods, which it runs through a `calculate_forecast` tool and saves to its forecast history.
- The backend serves Mula's tools over MCP at `/mcp` (`ask_agent`, `calculate_forecast`, `latest_forecast`), protected by a shared `MULA_TOOLS_KEY`. Each turn carries a ticket that scopes tool calls to one account, agent and turn. New dependency: the official `mcp` Python SDK.
- The Operator asks Forecasting with `ask_agent`. **When Operator needs another agent** offers Ask me first (default), Go ahead, or Don't ask other agents. The chat shows each request as a card with **Ask Forecasting** / **Not now**; Forecasting answers afterwards and the Operator relays it as a new reply.
- My agents: Brain section for Forecasting, the delegation setting, a **Chat** tab for talking to Forecasting directly (kept apart from the Operator conversation), and a dashed "asks" arrow from Operator to Forecasting on the map.
- The local Mula patch now allows the configured Qwen profile to run with at most five of Mula's own tools, at startup and before each request; any other tool keeps the upstream minimum. Tool search is turned off so the tools reach the model directly.
- Existing installs connect with `server/.venv/bin/python server/scripts/connect_agents.py`, then `./run.sh`.

Evidence: backend unit tests (121) and frontend tests (46) pass, type check is clean. Both browser specs passed against an isolated copy with a stand-in runtime that calls the real `ask_agent` tool: decline, approve with relay, reload, Go ahead, delegation setting, Forecasting chat, map link and 390px layouts. Live runs on a separate Mula test profile with local Qwen worked end to end in both Ask me first and Go ahead: the Operator asked Forecasting, Forecasting calculated from the CSV, and the relayed numbers matched the saved run.

Open: with local Qwen a full round takes about 9½ minutes, and the Operator tends to try `calculate_forecast` (refused) before `ask_agent`. Requests are one level deep and only the Operator asks. The DECISIONS.md conflict about routing all model calls through OpenRouter is still open, and now applies to Forecasting's brain too.

## 13 November 2026 — My team becomes My agents, an arrangeable map (Muhammad Rafandi, with Claude)

Request: reimagine My team as "My agents": pixel-art agent cards laid out on a free-flowing map, following the owner's mockup.

Changed:
- New `/agents` page (`/team` redirects). Operator and Forecasting appear as dark cards with pixel characters and a live status line (brain, or number of forecasting methods).
- Cards can be dragged anywhere on the map or nudged with the arrow keys. Positions are saved per account in a new `agent_map_positions` table through `PUT`/`DELETE /api/team/layout`, kept apart from agent settings so arranging never conflicts with a settings save. Reset layout restores the default.
- Clicking a card opens its existing settings (including the forecast runner) in a side panel, full-screen on phones. Phones show a stacked list without dragging.
- Sidebar, workspace link and messages now say "My agents". Code folders and `/api/team` keep the "team" name.

Evidence: backend unit tests (98) and frontend tests (41) pass, type check is clean. The updated browser spec passed against an isolated copy (test database, stand-in runtime): redirect, drag and keyboard arranging with reload, reset, settings panel, forecast run and export, and 390px layout. Screenshots at 1440px and 390px were checked.

Open: no connections between cards, since agents don't delegate yet. Pixel art exists only for the two current agents; others get a neutral robot.

## 13 November 2026 — Brain selector for the Operator (Muhammad Rafandi, with Claude)

Request: let the owner pick the language model ("brain") the Operator uses.

Changed:
- My team → Operator has a Brain section: Qwen (local, default), Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5. The choice is saved per account (new `agent_settings.brain` column, migrated automatically).
- The Mula runtime selects the brain per message through `model_routes` aliases. A brain the runtime doesn't serve is refused instead of being answered by Qwen.
- `server/scripts/enable_claude.py` adds or removes the Claude routes and a Claude Console API key. Subscription tokens are refused, and `start_hermes.sh` unsets them.

Evidence: backend unit tests (95) and frontend tests (34) pass, type check is clean, and a browser check covered defaults, setup states, save/reload and phone width. Not tested against a live Claude call: no API key was available.

Open: Claude calls go directly to Anthropic, while DECISIONS.md says all model calls go through OpenRouter. Needs reconciling.

## 13 November 2026 — Docs moved into the repo (El Kahfi, with Claude)

Request: move the planning docs into the shared repository so both team members' sessions read the same version.

Changed:
- Added `docs/planning/` with PROJECT_CONTEXT.md, REQUIREMENTS.md, DECISIONS.md, and CHANGELOG.md.
- These replace the claude.ai project copies as the source of truth.
- Earlier docs in the Claude project and the local Laras folder are out of date and should not be used.

Evidence: documentation only. No code changed.

Open: repo prototype runs local Ollama/Qwen, which conflicts with the hosted-only decision.

## 13 November 2026 — Direction reset and first app (El Kahfi, with Claude)

- Mula is the product; LARAS is the former name.
- Rewrote the planning docs around the workspace-plus-applications MVP, hosted-API AI through OpenRouter, a Docker image per workspace, and a separate database per user.
- First app set to a sales and stock book recorded by hand, with a daily summary agent.
- E-commerce integration moved after the MVP; owner chooses the platform.
- Old items (local Ollama, Qwen 27B, Tokopedia-first, six fixed agents, mandatory Procurement and Inventory modules) moved to superseded.

## Condensed earlier history

- **29 October 2026:** architecture and ERD documents created in the Laras folder. Accepted a two-infrastructure logical ERD.
- **27 October 2026:** generated-app boundary, dashboard flow, and UMKM adoption paths recorded.
- **26 October 2026:** target architecture requirements outlined.
- **24 October 2026:** project memory files created; Store Manager direction recorded; a Tokopedia browser signup was stopped at the user's request, with no account created.
- **23 October 2026:** original planning summary, kept as `LARAS-summary.md` at the repo root.
