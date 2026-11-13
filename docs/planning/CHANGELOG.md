# Mula change history

Dates use Asia/Jakarta. Entries before 13 November 2026 are condensed. Each entry names its author.

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
