# Team (client)

The **My agents** page (`/agents`). It shows the account's agents as pixel-art cards on a map that the owner can arrange, and opens each agent's settings in a side panel. For Forecasting, the panel also hosts a direct chat and the forecast runner. The old `/team` address redirects here. Internal names (`features/team`, `/api/team`) stay as they were.

## What it does

- Loads `/api/auth/me`, then `/api/team`, which returns every agent with its account-specific settings and the account's saved map `layout`.
- **Map:** each agent is a card with its pixel character, name, a stamina bar and a live status line (`Ready · <brain>` or `Brain needs setup`).
  - **Canvas:** the cards sit on a fixed 1600 × 1000 px world that the map pans and zooms (25%–200%) with one CSS transform, so cards, connectors and stamina bars always scale together. No library is used.
    - First visit fits every agent; after that the last zoom and position are remembered in this browser per user (`localStorage` key `mula.team.view.<username>`).
    - Zoom with Ctrl/⌘ + scroll, trackpad pinch (Safari gesture events included) or two-finger pinch on touch screens; zoom centres on the cursor or fingers. Plain scroll, dragging empty space or one finger pans. Dragging a card moves the card, never the map. Panning always keeps some of the world on screen.
    - Corner controls (real buttons): Zoom out, the zoom % (click resets to 100%), Zoom in, Fit to screen, and "What is stamina?".
    - Keys work only while focus is in the map: + and − zoom, 0 resets, F fits; the arrow keys pan when the map itself has focus. A card that gets keyboard focus off screen is panned into view.
    - Below 50% the cards show only the mascot, a larger name and the stamina bar; the status, stamina label and link labels are hidden.
    - Zoom glides for buttons and keys, and jumps instead under `prefers-reduced-motion`.
  - **Connectors** (`services/connectors.ts`): smooth cubic Bézier curves with no straight runs or corners. Each starts and ends at the middle of the two card edges that face each other across the wider gap, 12 px from the border. Its control handles run straight out of those edges (at least 40 px), so the line leaves and enters level, then bends softly.
    - If the curve would cross another card, the router tries waypoints at rising heights above and below it. The curve runs level at the waypoint, so the two joined curves have no corner. Points along each candidate are checked against every other card (with a 16 px margin), and the shortest clear one wins.
    - One 2 px stroke with round caps that stays 2 px on screen at any zoom, and a small chevron at the end that follows the curve's final direction.
    - **Active** links ("Ask me first" or "Go ahead") are solid; **planned** links are dashed. Lines don't animate. Planned means: delegation set to "Don't ask other agents", or a connection added in the panel that the runtime can't use yet. So the difference doesn't rely on colour.
    - **Lines carry no text.** Each line is a keyboard stop named with its meaning, for example "Operator to Forecasting: Asks after your OK". Hovering or focusing it shows the same text in a tooltip that keeps its size at every zoom. The pointer can move onto the tooltip, and Escape dismisses it. The connection cards in the settings panel show the same status. The wording is `LINK_LABELS` in `services/map.ts`.
    - Lines come from the agent store's connections and the card positions, so adding or removing a connection, saving the approval choice, dragging, resizing and zooming all redraw them.
  - **Stamina** (`services/stamina.ts`, `components/StaminaBar.tsx`): the tokens an agent has left this period, as a 10-cell pixel bar under the name.
    - `Agent.stamina` is `{ used, limit }`, where `limit: null` means unlimited. The server doesn't send it yet, so a missing or malformed value reads as unlimited. An unlimited bar has no label: all ten segments glow purple with a wave of energy flowing through them from left to right, and the bar sits centred on its card. The tooltip says "Unlimited stamina", screen readers hear "Stamina: unlimited", and under `prefers-reduced-motion` the bar stays purple and still. Limited bars keep their segments and a label such as "12k / 50k left".
    - With a limit, the fill is the share left (rounded up to whole cells) and the label reads "12k / 50k left". Below 20% left it adds a warning icon and "Low".
    - The bar's tooltip, the map's "What is stamina?" button and the settings panel explain: "Stamina is how many tokens this agent can still use this period."
    - Cards are buttons, so the stamina is part of each card's description ("Stamina: unlimited", or "Stamina: 12k of 50k tokens left, low"). In the settings panel it's a `role="meter"` with values, or an image named "Stamina: unlimited".
  - Positions are fractions (0–1) of the world, saved as before, and cards are clamped so they stay fully inside it.
  - Drag a card to move it (screen movement is divided by the zoom). Movements under 5px count as a click. On drop, `PUT /api/team/layout` saves all positions. Saves are queued so an older request can't overwrite a newer layout.
  - With a card focused, the arrow keys nudge it 2% (Shift: 8%), and it saves 600ms after the last key.
  - **Reset layout** sends `DELETE /api/team/layout` and restores the default staggered arrangement.
  - If a save fails, the card stays where it was put and an error explains it isn't saved yet.
  - Phones get the same canvas: pinch to zoom, one finger to pan, and cards can be dragged.
- **Settings panel:** clicking a card (or Enter/Space) opens a native `<dialog>`, 640px wide or a full-screen sheet on phones. Esc, the close button or the backdrop closes it, asking first if there are unsaved changes. Under the header and stamina, a tab list (proper tab roles; Left/Right, Home and End move between tabs) holds two layers, plus **Chat** and **Run a forecast** where the agent has them. The last layer chosen (Simple or Advanced) is remembered per user in this browser (`mula.team.panel-tab.<username>`).
  - **Simple** (default):
    - **Instructions**: a large text area (up to 4,000 characters) with a helper line and a character count. They personalize the agent but can't grant it new tools.
    - **Tools**: a card per enabled tool (icon, name, one-line description from `services/tools.ts`, and a "Remove … tool" button). The dashed **Add tool** card opens a picker of the agent's other available tools, each with a "+" button. At most 10 tools.
    - **Connections**: small agent cards (mascot, name, description) for the agents this one can hand work to, each removable. **Add connection** opens a picker of the other agents. Changes apply at once and redraw the map. For agents that can ask others on the runtime (today Operator), the approval choice sits here: *Ask me first* (default), *Go ahead* or *Don't ask other agents*.
  - **Advanced**:
    - **Brain**: a dropdown of the brains the app supports, with the current one selected. Each option names who receives the messages (this computer, Anthropic, or OpenRouter · Chutes). Brains marked "needs setup" can't be chosen until their provider's script has been run (`enable_claude.py` or `enable_openrouter.py`, named in the panel); choosing a cloud brain shows what is sent to that provider.
    - **Reference data** (up to 8,000 characters), treated as untrusted context.
    - **Technical details**, read-only and labelled "Set in config": agent id, runtime profile (`mula-<account id>`), enabled and available tool ids, the runtime's hand-offs (`delegates_to`), limits and the settings revision. Effort or reasoning level, memory scope and step or token limits don't exist in Mula yet, and the runtime tool list isn't exposed by the API, so they aren't shown.
  - Pickers close with Escape or their close button and return focus to the "+" card; adding moves focus to the new card, removing to the "+" card. Inside the panel the muted grey is darkened so text stays at 4.5:1 on the light background.
  - **Save settings** and **Cancel** sit in a footer that stays at the bottom of the panel; unsaved changes show a dot and "Unsaved changes". Both layers share one draft, so switching tabs keeps edits.
- **Agent store** (`services/agentStore.ts`, prototype): one client-side store that the map and the panel both read (`useAgentStore`). It is seeded from `/api/team`.
  - Instructions, reference data, tools, brain and delegation still save to the server (below), so they survive a reload because the server keeps them.
  - **Connections are client-only.** They start from the server's `delegates_to` and are kept in this browser's localStorage (`mula.team.agents.<username>`, wrapped in try/catch, synced across tabs). A connection the runtime supports is drawn solid (Ask me first or Go ahead), or dashed when delegation is off; any other is drawn dashed as planned, and the panel says Mula doesn't hand work along it yet. Removing Operator → Forecasting hides the line but doesn't stop Operator asking; choose *Don't ask other agents* for that.
  - **Real persistence needs agent records on the server**: connections (and any future per-agent fields) should become server-side data per account, replacing localStorage. Tool access must still be enforced server-side by `require_tool` in `server/src/features/team/service.py`; hiding or removing a tool in the UI is never the security boundary.
- **Save** sends `PUT /api/team/{agent}` with the current `revision`. If the settings were changed in another tab, the server returns 409. Moving cards doesn't change the revision, so arranging the map never conflicts with an open settings form.
- **Chat** (every agent except the Operator, whose tab links to the workspace): `AgentChat` loads `GET /api/agents/{agent}/conversation` and streams `POST /api/agents/{agent}/chat`, with an optional CSV. The chat is separate from the Operator conversation and uses the agent's saved settings. Closing the panel stops a reply in progress.
- For Forecasting, a **Run a forecast** tab embeds `ForecastPanel` from `features/forecasting`. Running a forecast is blocked until unsaved settings are saved.

Today the map shows two agents, **Operator** and **Forecasting**, because the server defines exactly those two.

## Files

| File | Purpose |
|---|---|
| `components/TeamPage.tsx` | Page header, Reset layout, `AgentDialog`, `AgentSettings` (draft, save, cancel, tabs), sign-out |
| `components/AgentPanelTabs.tsx` | Tab list with roving focus and arrow keys |
| `components/SimpleSettings.tsx` | Simple layer: instructions, tool cards, connection cards, approval choice |
| `components/AdvancedSettings.tsx` | Advanced layer: brain dropdown, reference data, read-only technical details |
| `components/CardPicker.tsx` | "Add …" card and its picker of cards, with Escape and focus return |
| `components/AgentMap.tsx` | Map world, cards, connectors with tooltips, pointer and keyboard arranging, layout saves |
| `components/MapControls.tsx` | Zoom out, zoom %, zoom in, fit, and the stamina explanation |
| `components/StaminaBar.tsx` | Segmented stamina bar with its label, for cards and the settings panel |
| `hooks/useViewport.ts` | Pan and zoom: wheel, pinch, drag, keys, fit and the remembered view |
| `components/AgentChat.tsx` | Direct chat with one agent |
| `components/PixelAgent.tsx` | 16×16 pixel characters as SVG; unknown agents get a neutral robot |
| `services/map.ts` | Pure map helpers: world and card sizes, default positions, clamping, drags, nudges, card status, agent links |
| `services/connectors.ts` | Connector routing: facing anchors, Bézier curves around cards, arrowheads, tooltip position |
| `services/viewport.ts` | Zoom limits, zoom around a point, fit, pan clamping, map keys, the saved view |
| `services/stamina.ts` | Stamina defaults, the share left, labels and spoken text |
| `services/agentStore.ts` | Prototype agent store: agents from the server, connections in localStorage, remembered panel layer |
| `services/tools.ts` | Icon and one-line description per tool id |
| `services/team.ts` | `Agent` type (with optional `stamina`), `saveLayout()`/`resetLayout()`, and `teamRequest()` fetch helper with friendly 401/404 messages |
| `team.css` | Page styles |
| `tests/map.test.mjs`, `connectors.test.mjs`, `viewport.test.mjs`, `stamina.test.mjs`, `agentStore.test.mjs` | Unit tests for the services (run by `npm test`) |
| `tests/map.browser.spec.mjs` | Optional Playwright check of connectors, stamina, controls, keys, wheel, drags, low zoom, the saved view, resize, planned links, reduced motion and touch. Fakes the account and team API, so it needs only the frontend |
| `tests/panel.browser.spec.mjs` | Optional Playwright check of the panel: tabs and keys, remembered layer, instructions, tools and pickers, connections and their lines, Advanced settings, contrast and the phone sheet. Fakes the API like the map check |
| `tests/browser.spec.mjs` | Optional Playwright check of the map and its link, arranging, settings and delegation, the Forecasting chat, forecasts, CSV export and phone layout. Needs a stand-in runtime that answers chats |
| `index.ts` | Exports `TeamPage` |

The route is `src/app/agents/page.tsx`; `src/app/team/page.tsx` redirects to it. The proxies are `src/app/api/team/route.ts` (GET), `src/app/api/team/layout/route.ts` (PUT, DELETE) and `src/app/api/team/[agent]/route.ts` (PUT, allowed only for `operator` and `forecasting`). The proxy limits these requests to 100 KB. The direct chat uses `src/app/api/agents/[agent]/chat` and `.../conversation`, allowed only for `forecasting`.

## Server counterpart

`server/src/features/team`: agent definitions, per-account settings, map layout and tool checks.

## Note for the Catalog direction

This page is the closest thing in the app to "installed capabilities". The list of agents is still hardcoded on both sides (the server's agent files in `server/agents/` and the proxy's allowlist). Pixel art and default map positions are keyed by agent id; a new agent works without them, using the fallback robot and a diagonal spread.
