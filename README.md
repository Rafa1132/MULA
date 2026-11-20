# Mula / LARAS

Mula's Operator chat now uses the actual [Nous Research Hermes Agent](https://github.com/NousResearch/hermes-agent) runtime. LARAS remains the underlying system name.

```text
Next.js chat → LARAS FastAPI → Hermes gateway → Ollama / Qwen
                                  │
                                  └─ Agent loop, session history, context compression
```

The app has simple username/password accounts. Each account owns one persistent Operator conversation, reopened after login or refresh. Sign out replaces New chat. Passwords are hashed and login sessions use private cookies; accounts and the visible chat history are stored in a PostgreSQL database (see `server/README.md`, "Database").

Both agents are Mula agents, each with its own persona, brain and session. Operator handles planning, uploaded CSVs and account memory, and can ask Forecasting for help: by default it asks you first with an **Ask Forecasting** button in the chat, and **My agents → Operator** can change that to "Go ahead" or turn it off. Forecasting calculates deterministic statistical forecasts with its own tool and explains them; you can also chat with it directly in **My agents → Forecasting → Chat**. The only model-callable tools are Mula's own (`ask_agent`, `calculate_forecast`, `latest_forecast`), served by the backend; terminal, file and web tools and cross-chat personal memory stay off. Inventory, Procurement and live business integrations are not implemented.

## Architecture

See [the current Mula harness architecture](docs/architecture/mula-harness.md) for the account boundary, Operator execution flow, storage, context management and current tool support.

The project groups application code by feature:

```text
LARAS/
├── public/                     # Static assets, including the Mula logo
├── src/
│   ├── app/                     # Next.js routes, layout and API entry points
│   ├── common/
│   │   ├── components/          # Shared UI components
│   │   ├── hooks/               # Shared hooks
│   │   ├── services/            # Shared server proxy
│   │   ├── styles/              # Global styles and theme
│   │   └── tests/
│   └── features/
│       ├── auth/                # Account UI and public index.ts
│       ├── operator/            # Core visualizer, streaming and tests
│       ├── voice/               # Speech playback and tests
│       ├── memory/              # Editable categorized notes and retrieval inspector
│       ├── team/                # Available agents, account settings and browser checks
│       ├── catalogue/           # Prototype catalogue of agents and apps (mock data)
│       ├── apps/                # Prototype My apps: added apps, their connection and actions
│       ├── forecasting/         # Forecast inputs, chart, report and CSV export
│       └── workspace/           # Chat screen
├── server/                     # Separate Python service
│   ├── src/
│   │   ├── main.py
│   │   ├── common/
│   │   └── features/            # Auth, Operator, voice, memory, team and forecasting
│   ├── tests/
│   ├── scripts/
│   └── hermes/
├── scripts/                    # Whole-app launcher
├── docs/
└── .runtime/                   # Private configuration and durable state
```

Client features expose their public APIs through `index.ts`; server features expose their integration surfaces through `__init__.py`. Keep feature-specific components, services and tests with their feature. Put code in `common` when multiple features need it. Next.js routing remains in `src/app`, while feature implementations live in `src/features`.

The client application now lives at the repository root, with top-level `public/` and `src/`. The Python service lives in `server/`. Restart existing processes after this move. The one-line launcher, ports, HTTP endpoints, account database and runtime profile locations remain compatible. Manual server startup now uses `src.main:app`.

## Run

After the one-time setup in [backend setup](server/README.md), start everything with one line from any Terminal location:

```sh
bash /Users/rafa/Desktop/LARAS/run.sh
```

From the project folder, `./run.sh` works too. It starts Ollama if needed, then FastAPI, Hermes (after FastAPI, because Hermes connects to the agent tools FastAPI serves) and the frontend, waits for them to become reachable, and opens http://127.0.0.1:3000. Existing services are reused. Leave this Terminal open; Ctrl+C stops only services started by this launcher. Logs are written under `.runtime/logs`. Use `./run.sh --no-open` to skip opening the browser.

The launcher uses the existing installation; it reports missing setup instead of downloading dependencies during every launch. If an old backend is still running without account endpoints, stop that Terminal first so port 8000 becomes available. The compact tool-free Operator profile uses the current Qwen model at its 40,960-token window.

## Pages and projects

- `/` is the public landing page; `/login` and `/register` sign in or create an account and go to `/workspace`.
- `/workspace` lists the account's **projects**. Each project is a separate business with its own Operator conversation, agents, memory and apps; a project with no name shows as "Untitled project" until it is renamed. Invite teammates and a GitHub connection are marked "Coming soon".
- The workspace's **assistant** (the orchestrator) is the owner's own, across projects. The first time, it asks a few skippable questions in its chat and writes the answers to the owner's `USER.md` (`.runtime/users/<account>/USER.md`, never shared with teammates), then offers a personality (tone, formality, English or Bahasa Indonesia, emoji). It reads each accessible project's memory summary. `/settings` edits both and restarts the questions.
- A project's pages live under `/projects/<id>/` (chat, Catalogue, My apps, My agents, Memory). The top-left of every project page shows the project's name and switches projects. The older addresses (`/memory`, `/agents`, …) open the same page in the first project.

The browser tells the server which project a call is for in the `X-Mula-Project` header; the server checks that the signed-in account belongs to it (`server/src/features/workspaces/`).

## Workspace and AI voice

### CSV attachments

Use **Attach CSV** beside the Operator input, or drop a CSV onto the composer. Ask a question with it, or send the file alone for a summary. Remove a selected file before sending to change your mind. Failed requests restore the attachment for retry. Each account's saved chat shows the filename and parsed row/column counts.

The server parses UTF-8 CSV using the Python standard library, including quoted cells, multiline values, a UTF-8 BOM, and comma/semicolon/tab/pipe delimiters. The first CSV record is the header; empty lines and subsequent blank rows are ignored. Blank headers receive names such as `Column 2`, and duplicate headers receive suffixes such as `Sales (2)`, preserving any existing names. Adjustments are shown in the attachment label and supplied to the Operator. Every data row must have the same width. One file per message is supported, up to 50,000 bytes, 500 data rows, 40 columns, 2,000 characters per cell and 24,000 characters of prepared context. Files exceeding a limit are rejected before any rows reach the model; they are never silently sampled.

The full parsed table, missing-value counts and exact decimal sum/min/max summaries for plain numeric columns are supplied to Qwen with the question. Currency-formatted, percentage and mixed columns remain text. CSV cells and formulas are treated as data. The Operator explains the supplied export; it has no live business connection or code execution tool. Original files are not stored in a file library. Their parsed contents live in the runtime conversation and may be lost through context compression; reattach the CSV if the Operator needs the original rows again. Only attachment labels are stored in the app's visible chat records. This does not add RAG, Graphify, or runtime tools.

Restart the running server after updating so it loads the new `csv_file` chat field.

The look is quiet and mostly monochrome, with the Mula logo's dawn orange as the one accent: light by default and dark when the device prefers it. Every colour is a token in `src/common/styles/globals.css` (`--background`, `--ink`, `--accent`, …), and the pages, the forecast chart and the Operator core all draw from those tokens, so nothing hardcodes a theme. Surfaces are separated by space and a soft shadow rather than lines (dark mode gives cards a faint edge instead). The typeface is Geist, bundled at build time through `next/font` (the first build needs network access to fetch it). Motion is deliberate and quiet: every control eases the same way and lifts on hover, text shimmers while Mula is preparing something, and the status dot pulses while audio is live. The workspace is the Operator core in a faint dawn halo, one welcome line, the status line, the conversation and a single composer pill; voice settings live in a small menu inside the pill. The core breathes and counter-rotates while idle, with additional movement driven by the actual playback waveform through Web Audio; reduced-motion preferences keep everything still. Reports and My website remain marked as upcoming.

**My agents** (`/agents`; `/team` redirects there) uses neutral charcoal surfaces and clay accents. It shows Operator and Forecasting as pixel-art cards on a map the owner can arrange by dragging or with the arrow keys; positions are saved per project, and Reset layout restores the default. Phones get a stacked list. Click a card to open its settings panel and edit its additional instructions, reference data and enabled tools. Settings are account-scoped in SQLite and apply on the next request; concurrent edits are rejected rather than silently overwritten. Operator's CSV reading, memory retrieval and explicit memory saves are enforced server-side. Disabling a capability does not erase earlier chat content.

Select **Forecasting → Run a forecast** to upload historical CSV data, choose date/value columns and daily, weekly or monthly frequency, and forecast 1–90 periods. Available tools are last value, fixed trailing moving average, simple exponential smoothing, seasonal repeat and drift. Automatic comparison selects the lowest MAE on common expanding-window one-step test periods. The page includes a chart, values, historical MAE/RMSE, assumptions and a CSV download. At least six regular periods are required; seasonal repeat needs two full cycles before the test period. Missing periods, duplicates and ambiguous numbers must be resolved explicitly.

Calculations work without an LLM. **Ask Forecasting to explain** passes the saved report and this agent's instructions/reference data to Forecasting's brain in an isolated session. The LLM never generates forecast values; when Forecasting is asked in chat it runs the same calculation as a tool. The latest 20 reports per account persist in the application database, including the selected date/value history, but the original CSV is not stored. Prompt/reference changes affect how Forecasting talks, while numerical parameters control calculations. See [forecasting and agent settings](docs/forecasting.md) for formulas, data requirements and storage.

Voice mode reads each newly completed answer aloud. Select **Chat** or the speaker/mute button to stop audio immediately and disable automatic speech. This preference is remembered in this browser. Existing history is never read automatically; **Play reply** replays an answer when voice is enabled. Sending another message, signing out or hiding the tab stops current playback. The microphone button provides separate speech-to-text input; the speaker/mute button controls AI voice output.

After updating from the text-only version, restart the running backend before using voice; the launcher deliberately reuses existing services, so an old process will not load the new speech endpoint automatically.

The initial free provider is macOS's built-in `say` engine on the backend machine, using its configured system voice. No paid API, model download or new dependency is required. Audio is generated in a private temporary directory, returned as uncached WAV through the authenticated `/api/speech` proxy, and deleted after generation. The frontend removes code/Markdown syntax and splits long answers into chunks; each speech request is limited to 1,200 characters, one synthesis job per backend process, with a 30-second generation timeout. Muting cancels client requests and playback; an already running server job can finish within that bound if its connection closes. Replies remain readable if voice fails.

This provider needs **a macOS backend**; browsers on other devices can use that backend. A Linux/GPU production deployment needs a replacement speech provider. The endpoint does not forward conversation text to a third-party TTS service. Speech starts after the text reply completes, and long replies may pause between chunks. Browser audio permission is unlocked by Send/Voice/Play reply interactions.

## Verify

```sh
cd server
.venv/bin/python -m unittest discover -s . -t . -v
```

```sh
# From the repository root
npm run typecheck
npm test
npm run build
```

Optional UI regression: with a preview running on port 3001 and Playwright available, run `node src/features/team/tests/browser.spec.mjs` and `node src/features/project/tests/browser.spec.mjs`. Both need a stand-in runtime that answers chats; the project chat check also needs it to call the backend's `ask_agent` tool when asked to forecast. `node src/features/workspace/tests/browser.spec.mjs` and `node src/features/landing/tests/browser.spec.mjs` fake the API and need only the frontend. `MULA_TEST_URL` overrides the preview address, `MULA_PLAYWRIGHT_MODULE` can point to an existing Playwright module, and `MULA_BROWSER_PATH` can select an installed browser. Use an isolated test backend/database: this check creates a test account and forecasts. It covers the `/team` redirect, arranging the map (drag, keyboard, reload, reset), the settings panel, settings persistence, real calculations, CSV export, report reload, tool changes and phone layout. On a `next dev` preview, use `http://localhost:<port>` rather than `127.0.0.1`: Next blocks its dev resources for other origins and the page won't hydrate. Set `MULA_TEST_EXPLANATION=1` to also verify an explanation through the running Qwen gateway.

The backend tests simulate the documented Hermes HTTP boundary, including session routing, interrupted streams, authentication failures, reasoning filtering and cancellation. They do not substitute for a live Hermes/model test.

## Deployment boundary

This version provides local accounts and server-enforced conversation ownership. One account represents one workspace. Employee invitations, roles, password recovery and separate Hermes memory profiles are not implemented yet. Cross-chat personal memory remains disabled until profile isolation is implemented. For HTTPS hosting, set `LARAS_SECURE_COOKIES=true`, protect the database and keep Hermes private.

## Inspectable memory

Open **Memory** to browse and edit the project's categorized Markdown files. SQLite FTS5 retrieves relevant notes for the Operator; essential facts are supplied consistently. Use `/remember Your fact` to save an explicit note from chat. Nothing is automatically inferred into permanent memory from ordinary messages or CSVs.

See [memory files, RAG and SQLite inspection](docs/memory-and-sqlite.md) for the full tree, retrieval limits, manual editing, and copyable read-only SQL queries. Application data is in PostgreSQL (see `server/README.md`); each project's memory lives in `.runtime/workspaces/<project-id>/memory/`. Restart the running server to load the memory endpoints.

## Speech-to-text input

Click the microphone beside the Operator input, allow microphone access, and speak. Choose **English** or **Bahasa Indonesia** with the Speech language selector; this preference is remembered in the browser. Interim words appear in a separate preview, while finalized speech appends to the current draft. Existing typed text stays editable. Click the microphone again to stop, review or edit the draft, then press **Send**. Dictation never sends messages automatically, and Send is disabled until recording finishes.

Starting dictation stops AI speech to avoid feedback. Leaving the tab, signing out, or navigating away cancels recording. Permission denial, missing microphones, no speech and recognition-service failures produce actionable messages. The 8,000-character message limit also applies to dictation. Unsupported browsers keep typed chat available with an explanation beside the disabled microphone.

This initial implementation uses the browser’s Web Speech `SpeechRecognition` / `webkitSpeechRecognition` API, requiring browser support and a secure context (HTTPS or localhost). No API key or new package is required. Some browsers send audio to an online recognition service, so recognition may need internet access and is not guaranteed to run on the device. Mula does not upload microphone recordings to its backend; only the reviewed text is sent when you press Send. See [MDN’s SpeechRecognition documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) for browser/service limitations.

The optional `src/features/voice/tests/browser.spec.mjs` check uses a simulated recognition engine to exercise the dictation UI, cancellation, permission errors and mobile layout. Set `MULA_PLAYWRIGHT_MODULE`, `MULA_BROWSER_PATH` and `MULA_TEST_URL` as needed, as with the team browser check. It does not measure real microphone transcription accuracy.

## Live conversation

Click **Start live conversation** for hands-free turns. Speak, then pause for about 1.4 seconds after the last recognition update. The app finalizes your transcript and submits it automatically. Mula begins speaking completed sentences or longer phrases as text tokens arrive, without waiting for the full answer. When both generation and playback finish, the microphone listens for your next turn.

The microphone pauses while Mula is responding to avoid hearing its own output. Tap the microphone (**Interrupt and speak**) to cancel the current reply and speak again. While listening, tap it to finish your spoken turn immediately. **End live conversation**, switching to Chat/muting, Stop reply, Stop audio, hiding the tab, signing out, or leaving the page ends the session. Permission, model and TTS failures stop the loop with an explanation; there is no background auto-retry. A 20-second no-speech timeout also pauses the session. The live mode is an explicit opt-in and is not restored on refresh.

Live conversation enables AI voice output and sends finalized speech without a separate Send click. Any existing draft is included with the first spoken turn, but it is never submitted without actually hearing speech. Draft editing and new CSV selection are disabled during a live session; end the session to edit or attach a file. Normal typing and microphone dictation retain their review-before-Send behavior.

This is a turn-based pipeline using browser recognition, local Qwen text streaming and the existing macOS TTS provider. It is not a full-duplex audio model: spoken barge-in while the AI is playing is not enabled, and interruption uses the microphone control. Browser recognition may use an online vendor service, and audible response time depends on recognition finalization, model speed, and TTS. Speech synthesis is requested per segment, so short gaps may occur. Markdown code blocks are omitted from spoken segments, and pending text/audio is discarded when a turn is interrupted.

Unit checks for this loop are in `src/features/voice/tests/liveConversation.test.mjs`. The optional `live.browser.spec.mjs` check in the same directory uses simulated microphone/model input and real local TTS to verify automatic turns, speech before text completion, interruption and mobile layout. It requires an isolated server with TTS on port 8001 and a preview targeting that server on port 3001; override `MULA_TEST_URL`, `MULA_PLAYWRIGHT_MODULE` and `MULA_BROWSER_PATH` as needed. It creates a temporary account in that server's database and does not test real microphone recognition accuracy.
