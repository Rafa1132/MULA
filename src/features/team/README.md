# Team (client)

The **My agents** page (`/agents`). It shows the account's agents as pixel-art cards on a map that the owner can arrange, and opens each agent's settings in a side panel. For Forecasting, the panel also hosts a direct chat and the forecast runner. The old `/team` address redirects here. Internal names (`features/team`, `/api/team`) stay as they were.

## What it does

- Loads `/api/auth/me`, then `/api/team`, which returns every agent with its account-specific settings and the account's saved map `layout`.
- **Map:** each agent is a card with its pixel character, name and a live status line (`Ready · <brain>` or `Brain needs setup`).
  - A dashed arrow joins an agent to each agent it may ask (`delegates_to`), labelled "asks after your OK" or "asks directly" from the delegation setting. "Don't ask other agents" hides it. The line is drawn in pixels between the cards' edges, follows a drag, and is hidden on phones; screen readers get the same links as a list.
  - Positions are fractions (0–1) of the map, so a layout survives window resizes. Cards are clamped so they stay fully on the map.
  - Drag a card to move it. Movements under 5px count as a click. On drop, `PUT /api/team/layout` saves all positions. Saves are queued so an older request can't overwrite a newer layout.
  - With a card focused, the arrow keys nudge it 2% (Shift: 8%), and it saves 600ms after the last key.
  - **Reset layout** sends `DELETE /api/team/layout` and restores the default staggered arrangement.
  - If a save fails, the card stays where it was put and an error explains it isn't saved yet.
  - Under 700px the cards stack in one column and can't be dragged; saved positions are kept for larger screens.
- **Settings panel:** clicking a card (or Enter/Space) opens a native `<dialog>`, 640px wide or full-screen on phones. Esc, the close button or the backdrop closes it, asking first if there are unsaved changes. The panel contains:
  - **Additional instructions** (up to 4,000 characters), which personalize the agent but can't grant it new tools
  - **Reference data** (up to 8,000 characters), treated as untrusted context
  - **Enabled tools**: checkboxes for the agent's available tools
  - **Brain**: the language model this agent uses; each agent chooses its own. Local Qwen is the default. Claude brains marked "Needs setup" are disabled until `server/scripts/enable_claude.py` has been run. Choosing a cloud brain shows what is sent to Anthropic.
  - **When Operator needs another agent** (agents with `delegates_to`, today the Operator): *Ask me first* (default), *Go ahead* or *Don't ask other agents*.
- **Save** sends `PUT /api/team/{agent}` with the current `revision`. If the settings were changed in another tab, the server returns 409. Moving cards doesn't change the revision, so arranging the map never conflicts with an open settings form.
- **Chat** (every agent except the Operator, whose tab links to the workspace): `AgentChat` loads `GET /api/agents/{agent}/conversation` and streams `POST /api/agents/{agent}/chat`, with an optional CSV. The chat is separate from the Operator conversation and uses the agent's saved settings. Closing the panel stops a reply in progress.
- For Forecasting, a **Run a forecast** tab embeds `ForecastPanel` from `features/forecasting`. Running a forecast is blocked until unsaved settings are saved.

Today the map shows two agents, **Operator** and **Forecasting**, because the server defines exactly those two.

## Files

| File | Purpose |
|---|---|
| `components/TeamPage.tsx` | Page header, Reset layout, `AgentDialog`, `AgentSettings` editor, tabs, sign-out |
| `components/AgentMap.tsx` | Map canvas, cards, links between agents, pointer and keyboard arranging, layout saves |
| `components/AgentChat.tsx` | Direct chat with one agent |
| `components/PixelAgent.tsx` | 16×16 pixel characters as SVG; unknown agents get a neutral robot |
| `services/map.ts` | Pure map helpers: default positions, clamping, drag threshold, nudges, card status, agent links and their line geometry |
| `services/team.ts` | `Agent` type, `saveLayout()`/`resetLayout()`, and `teamRequest()` fetch helper with friendly 401/404 messages |
| `team.css` | Page styles |
| `tests/map.test.mjs` | Unit tests for `services/map.ts` (run by `npm test`) |
| `tests/browser.spec.mjs` | Optional Playwright check of the map and its link, arranging, settings and delegation, the Forecasting chat, forecasts, CSV export and phone layout. Needs a stand-in runtime that answers chats |
| `index.ts` | Exports `TeamPage` |

The route is `src/app/agents/page.tsx`; `src/app/team/page.tsx` redirects to it. The proxies are `src/app/api/team/route.ts` (GET), `src/app/api/team/layout/route.ts` (PUT, DELETE) and `src/app/api/team/[agent]/route.ts` (PUT, allowed only for `operator` and `forecasting`). The proxy limits these requests to 100 KB. The direct chat uses `src/app/api/agents/[agent]/chat` and `.../conversation`, allowed only for `forecasting`.

## Server counterpart

`server/src/features/team`: agent definitions, per-account settings, map layout and tool checks.

## Note for the Catalog direction

This page is the closest thing in the app to "installed capabilities". The list of agents is still hardcoded on both sides (the server's `AGENTS` dict and the proxy's allowlist). Pixel art and default map positions are keyed by agent id; a new agent works without them, using the fallback robot and a diagonal spread.
