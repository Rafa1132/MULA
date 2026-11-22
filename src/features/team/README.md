# Team (client)

The **My agents** page (`/agents`). It shows the project's agents as cards with their characters (the art direction in `docs/design/agent-art/`) on a map that the owner can arrange, and opens each agent's settings in a side panel. For Forecasting, the panel also hosts a direct chat and the forecast runner. The old `/team` address redirects here. Internal names (`features/team`, `/api/team`) stay as they were.

## What it does

- Loads `/api/auth/me`, then `/api/team`, which returns every agent with its account-specific settings and the account's saved map `layout`.
- **Map:** each agent is a card with its character (the Operator, the orchestrator, is the animated orb; Forecasting is the Finance bubble bot; see `services/avatar.ts`), name, a stamina bar and a live status line (`Ready · <brain>` or `Brain needs setup`).
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
    - **Active** links ("Ask me first" or "Go ahead") are solid; a link switched **Off** is dashed. Lines don't animate, so the difference doesn't rely on colour. An agent that isn't connected (`none`) has no line.
    - **Lines carry no text.** Each line is a keyboard stop named with its meaning, for example "Operator to Forecasting: Asks after your OK". Hovering or focusing it shows the same text in a tooltip that keeps its size at every zoom. The pointer can move onto the tooltip, and Escape dismisses it. The connection cards in the settings panel show the same status. The wording is `LINK_LABELS` in `services/map.ts`.
    - Lines come from each agent's saved links and the card positions, so saving a connection change, dragging, resizing and zooming all redraw them. An unsaved connection change shows in the panel only.
  - **Stamina** (`services/stamina.ts`, `components/StaminaBar.tsx`): the tokens an agent has left this period, as a 10-cell pixel bar under the name.
    - `Agent.stamina` is `{ used, limit }`, where `limit: null` means unlimited. The server doesn't send it yet, so a missing or malformed value reads as unlimited. An unlimited bar has no label: all ten segments glow purple with a wave of energy flowing through them from left to right, and the bar sits centred on its card. The tooltip says "Unlimited stamina", screen readers hear "Stamina: unlimited", and under `prefers-reduced-motion` the bar stays purple and still. Limited bars keep their segments and a label such as "12k / 50k left".
    - With a limit, the fill is the share left (rounded up to whole cells) and the label reads "12k / 50k left". Below 20% left it adds a warning icon and "Low".
    - The bar's tooltip, the map's "What is stamina?" button and the settings panel explain: "Stamina is how many tokens this agent can still use this period."
    - Cards are buttons, so the stamina is part of each card's description ("Stamina: unlimited", or "Stamina: 12k of 50k tokens left, low"). In the settings panel it's a `role="meter"` with values, or an image named "Stamina: unlimited".
  - Positions are fractions (0–1) of the world, saved as before, and cards are clamped so they stay fully inside it.
  - **Cards never overlap.** Every card keeps at least 24 world pixels (`CARD_GAP`) from the others. A card dropped on or too near another moves to the nearest free spot (`freeSpot` in `services/map.ts`, a ring search outward from the drop, inside the world). The starting layout and agents added later are settled the same way (`initialLayout`, `settleLayout`): saved positions keep their place where they're already clear, and the rest make room. A settled starting layout is saved only when the owner next moves a card. While dragging, a card can pass over others; it is settled on drop, and keyboard moves are settled when their save fires. Connectors follow the settled positions.
  - Drag a card to move it, from anywhere on the card, mascot included (screen movement is divided by the zoom). The bot image is `draggable="false"` with `pointer-events: none`, so the browser's own image drag can't take over and the press always reaches the card. Movements under 5px count as a click and open the settings. On drop, `PUT /api/team/layout` saves all positions. Saves are queued so an older request can't overwrite a newer layout.
  - With a card focused, the arrow keys nudge it 2% (Shift: 8%), and it saves 600ms after the last key.
  - **Reset layout** sends `DELETE /api/team/layout` and restores the default staggered arrangement.
  - If a save fails, the card stays where it was put and an error explains it isn't saved yet.
  - Phones get the same canvas: pinch to zoom, one finger to pan, and cards can be dragged.
- **Settings panel:** clicking a card (or Enter/Space) opens a native `<dialog>`, 640px wide or a full-screen sheet on phones. Esc, the close button or the backdrop closes it, asking first if there are unsaved changes. Under the header and stamina, a tab list (proper tab roles; Left/Right, Home and End move between tabs) holds two layers, plus **Chat** and **Run a forecast** where the agent has them. The last layer chosen (Simple or Advanced) is remembered per user in this browser (`mula.team.panel-tab.<username>`).
  - **Simple** (default):
    - **Instructions**: a large text area (up to 4,000 characters) with a helper line and a character count. They personalize the agent but can't grant it new tools.
    - **Tools**: a card per enabled tool (icon, name, one-line description from `services/tools.ts`, and a "Remove … tool" button). The dashed **Add tool** card opens a picker of the agent's other available tools, each with a "+" button. At most 10 tools.
    - **Runtime tools** (`components/RuntimeTools.tsx`): a switch per runtime toolset the agent's file allows, with the tool names and a note. Everything starts off. *Needs setup* toolsets (web search, image generation) can't be switched on; *May use paid credits* marks vision. Saved with the panel and enforced by the agent's own runtime profile.
    - **Connections** (A2A, `components/ConnectionsSettings.tsx`): a card per connected agent (mascot, name, description, status) with a *When <agent> needs <other>* select: *Ask me first*, *Go ahead* or *Off*. Each card can show the other agent's A2A card (`GET /api/team/{id}/card`). **Add connection** lists only the agents the file's `delegates_to` allows; adding starts at *Ask me first*, removing sets *not connected*. Saved with the panel.
  - **Advanced**:
    - **Brain**: a dropdown of the brains the app supports, with the current one selected. Each option names who receives the messages (this computer, Anthropic, or OpenRouter · Chutes). Brains marked "needs setup" can't be chosen until their provider's script has been run (`enable_claude.py` or `enable_openrouter.py`, named in the panel); choosing a cloud brain shows what is sent to that provider.
    - **Reference data** (up to 8,000 characters), treated as untrusted context.
    - **Client access** (ACP, `components/ClientAccess.tsx`): create, list and revoke keys that let an editor (Zed, VS Code, JetBrains) talk to this agent through `server/scripts/mula_acp.py`. A new key is shown once, with a copy-ready Zed `agent_servers` entry (`services/clientAccess.ts`). Keys act at once and don't wait for Save settings. Enter in the label field makes a key instead of saving the panel.
    - **Technical details**, read-only and labelled "Set in config": agent id, runtime profile (`mula-<project id>` for the Operator, `mula-<project id>-<agent>` for others), enabled and available tool ids, the agents it may ask (`delegates_to`), the runtime toolsets offered, limits and the settings revision. Effort or reasoning level, memory scope and step or token limits don't exist in Mula yet, so they aren't shown.
  - Pickers close with Escape or their close button and return focus to the "+" card; adding moves focus to the new card, removing to the "+" card. Inside the panel the muted grey is darkened so text stays at 4.5:1 on the light background.
  - **Save settings** and **Cancel** sit in a footer that stays at the bottom of the panel; unsaved changes show a dot and "Unsaved changes". Both layers share one draft, so switching tabs keeps edits.
- **Agent store** (`services/agentStore.ts`): one client-side store that the map and the panel both read (`useAgentStore`). It is seeded from `/api/team`.
  - Every setting is the server's: instructions, reference data, tools, brain, runtime tools and links. Connections (the map's lines) are read from each agent's saved `links`. The only thing kept in this browser is the panel tab last chosen.
  - The old localStorage connections key (`mula.team.agents.<username>`) is no longer read.
  - The server is what enforces each setting (`require_tool`, link modes, the runtime profile's toolsets); the UI is never the security boundary.
- **Save** sends `PUT /api/team/{agent}` with the current `revision`. If the settings were changed in another tab, the server returns 409. Moving cards doesn't change the revision, so arranging the map never conflicts with an open settings form.
- **Chat** (every agent except the Operator, whose tab links to the workspace): `AgentChat` loads `GET /api/agents/{agent}/conversation` and streams `POST /api/agents/{agent}/chat`, with an optional CSV. The chat is separate from the Operator conversation and uses the agent's saved settings. When the agent asks a connected agent, the request shows as a card under its reply (`AgentRequestCard` from `features/project`); approving it runs the other agent and the answer is relayed in this chat. *Go ahead* requests run as soon as the reply ends. Closing the panel stops a reply in progress.
- For Forecasting, a **Run a forecast** tab embeds `ForecastPanel` from `features/forecasting`. Running a forecast is blocked until unsaved settings are saved.

Today the map shows two agents, **Operator** and **Forecasting**, because the server defines exactly those two.

## Add agent and the list view

- **Map / List**: a switch under the header. Map is the canvas above. List is a grid of cards with the same data (mascot, name, status dot and short role, the first sentence of the description), plus the agents added here. A server agent's card opens its settings panel; an added agent's card opens its detail, which is the Add agent form with its saved values, **Save changes** and **Delete agent**.
- **Add agent** (top right) opens the form in the same side panel. Fields: name (required, unique in the workspace, compared without case against every agent's name and id), short description, role (free text plus Finance, Sales, Marketing, Support, Operations, Developer), tools and skills (only from this project's inventory, `features/inventory`; items that aren't installed or connected are disabled with a **Set up** link that opens Inventory in a new tab at that item), model (from the inventory's models, the default preselected), a **Require owner approval** switch per selected tool (on by default for tools that send messages, move money or change data), **Hands work to** (other agents; stored now, drawn on the map once Mula runs the agent) and instructions (up to 4,000 characters, with a count).
- **Validation** (`services/agentForm.ts`): name required and unique, at least one tool or skill, a usable model, and only working items from this workspace. Errors show inline once a field is changed, and for every field when Create is pressed. Create looks disabled until the form is valid but stays focusable (`aria-disabled`), so pressing it explains what is missing and moves focus to the first error.
- Create saves the agent, adds it to the list, switches to List and shows a toast. Cancel, Escape, the close button and the backdrop ask first if there are unsaved changes; so does leaving the page.
- **Where added agents live:** in this browser, per project (`localStorage` key `mula.agents.workspace.<project id>`), through the async functions in `services/workspaceAgents.ts`, so they can later call an API without the form changing. They are not on the map and Mula doesn't run them yet: their cards say *Saved · not running yet*. Their ids already fit the server's agent id rule (`agentIdFor`).
- **Inventory rules:** if an item an added agent uses is removed or stops working, its card shows a **Check inventory** badge and its detail lists the problems; the agent is kept. Deleting an agent leaves the inventory alone. Other agents that hand work to a deleted agent keep that setting, shown as *(deleted)*, until the owner removes it.

### Starting from a template (Customer Service)

- When the server has a template agent the project hasn't added (`templates` in `/api/team`; a file in
  `server/agents/` with `template: true`), Add agent opens with **Start from: Blank · Customer Service**.
  Blank is the form above. Switching after typing asks first.
- **Customer Service** shows its own form (`agentForm/TemplateForm.tsx`): its tools, each with its approval rule
  (none of them moves money, changes orders or shares files, so none waits; such requests become handoff
  tickets), **Channels** (WhatsApp can be ticked only once Inventory has a connected number, with a **Connect
  in Inventory** link otherwise), tone (Friendly, Professional, Concise), brain and instructions.
- Unlike a blank agent it runs on the server: **Add Customer Service** posts to
  `/api/team/templates/customer_service`, then the agent joins the map (the Support bot) and the list.
- Its settings panel has a **Customer service** tab (`CustomerServiceSettings.tsx`): tone, the WhatsApp
  switch, **Only these numbers** (an allowlist for testing), links to the Knowledge base and the Inbox, and
  **Remove agent** (the knowledge base and inbox stay; it can be added again). Saved with `PUT
  /api/team/customer_service/support`.

### Connecting an added agent to Mula so it can run its tools

An added agent is a definition only. To make Mula run it, the server needs to own it:

1. **Store it on the server.** Add `POST /api/team` (and `PUT`/`DELETE /api/team/{id}`) in `server/src/features/team`, scoped to the project like the other team routes, that validates the same rules as `services/agentForm.ts` again on the server (the browser is never the security boundary) and saves the agent per project, for example in an `agent_definitions` table, or writes `server/agents/<id>.md` for agents shared by every account. Then swap the bodies of `createWorkspaceAgent`, `updateWorkspaceAgent`, `deleteWorkspaceAgent` and `listWorkspaceAgents` for calls to it and widen the proxy allowlist in `src/app/api/team/[agent]/route.ts`.
2. **Map the fields** onto what an agent file already holds (`server/agents/*.md`, read by `server/src/common/agent_catalog.py`): plain tool ids → `capabilities` (id: label, the tools the owner switches on); `toolset:<name>` ids → `runtime_toolsets` (only `SAFE_TOOLSETS`; each still starts off and is switched on in the settings panel); `name`, `description` and `instructions` → the front matter and the persona below it; `handsWorkTo` → `delegates_to` (agent id: link mode), each starting at `ask` (*Ask me first*); `model` (`model:<brain>`) → the agent's brain, which is a per-account setting saved like the panel's Brain dropdown, not part of the file. `approvals` have no server equivalent yet: enforce them where Mula runs a tool, the same way A2A *Ask me first* requests wait for the owner (`server/src/features/a2a`). Skills and connectors need server support first.
3. **Give it a runtime profile.** Each non-Operator agent runs in its own Mula profile, `mula-<project id>-<agent id>` (`server/src/common/profiles.py`). Run the existing provisioning (`server/scripts/provision_profiles.py` and `apply_hermes_profile.py`) for the new id so the profile exists with only the allowed toolsets.
4. **Show it.** Once `/api/team` returns the agent, it appears on the map with its links, gets the settings panel and its chat, and the List card drops *not running yet*.

## Files

| File | Purpose |
|---|---|
| `components/TeamPage.tsx` | Page header, Reset layout, `AgentDialog`, `AgentSettings` (draft, save, cancel, tabs), sign-out |
| `components/AgentPanelTabs.tsx` | Tab list with roving focus and arrow keys |
| `components/SimpleSettings.tsx` | Simple layer: instructions, tool cards, runtime tools, connections |
| `components/RuntimeTools.tsx` | Runtime tool switches with readiness notes |
| `components/ConnectionsSettings.tsx` | A2A connections: mode per connected agent, add and remove, the other agent's card |
| `components/ClientAccess.tsx` | ACP client keys and the editor setup snippet |
| `components/AdvancedSettings.tsx` | Advanced layer: brain dropdown, reference data, client access, read-only technical details |
| `components/CardPicker.tsx` | "Add …" card and its picker of cards, with Escape and focus return |
| `components/AgentMap.tsx` | Map world, cards, connectors with tooltips, pointer and keyboard arranging, layout saves |
| `components/StaminaBar.tsx` | Segmented stamina bar with its label, for cards and the settings panel |
| `components/AgentChat.tsx` | Direct chat with one agent, with its requests to other agents |
| `components/AgentAvatar.tsx` | An agent's character: the orb, a bubble bot from `public/agents/`, or its initial |
| `services/avatar.ts` | Which character each agent is (tested in `tests/avatar.test.mjs`) |
| `services/map.ts` | Pure map helpers: world and card sizes, default positions, clamping, drags, nudges, card status, agent links, the low-detail zoom and the saved-view key |
| `services/connectors.ts` | Connector routing: facing anchors, Bézier curves around cards, arrowheads, tooltip position |
| `services/stamina.ts` | Stamina defaults, the share left, labels and spoken text |
| `services/agentStore.ts` | Agent store: agents and their links from the server, remembered panel layer |
| `services/clientAccess.ts` | The editor settings snippet for a client key |
| `services/tools.ts` | Icon and one-line description per tool id |
| `services/team.ts` | `Agent` type (with optional `stamina` and, for template agents, `support`), `saveLayout()`/`resetLayout()`, and `teamRequest()` fetch helper with friendly 401/404 messages |
| `services/templates.ts` | Template agents: types, `channelOptions`, `templateDraft`, `validateTemplate`, `templatePayload`, `parseAllowlist`, and the add, remove and support-settings calls |
| `components/CustomerServiceSettings.tsx` | The Customer service tab |
| `team.css` | Page styles |
| `components/AgentList.tsx` | The list view: agent cards with status dot, role and inventory warning |
| `components/agentForm/AgentForm.tsx` | The Add agent form and an added agent's detail: fields, inline errors, focus on the first error |
| `components/agentForm/AgentFormDialog.tsx` | The side panel around the form, with **Start from** and the unsaved-changes warning |
| `components/agentForm/TemplateForm.tsx` | Adding a server agent from its template |
| `components/agentForm/InventoryChecklist.tsx`, `ApprovalSwitches.tsx`, `HandoffChecklist.tsx`, `FieldError.tsx` | The form's parts |
| `components/Toast.tsx` | The confirmation toast |
| `services/agentForm.ts` | Form limits, defaults, approval defaults and validation |
| `services/workspaceAgents.ts` | Added agents: types, ids, and the browser-backed create, update, delete and list |
| `services/agentCards.ts` | Cards for the list view, with status and inventory warning |
| `agent-form.css` | Styles for Add agent, the list view and the toast |
| `tests/map.test.mjs`, `connectors.test.mjs`, `stamina.test.mjs`, `agentStore.test.mjs`, `clientAccess.test.mjs`, `agentForm.test.mjs`, `workspaceAgents.test.mjs`, `agentCards.test.mjs`, `templates.test.mjs` | Unit tests for the services (run by `npm test`) |
| `tests/map.browser.spec.mjs` | Optional Playwright check of connectors, stamina, controls, keys, wheel, drags, low zoom, the saved view, resize, links switched off, reduced motion and touch. Fakes the account and team API, so it needs only the frontend |
| `tests/panel.browser.spec.mjs` | Optional Playwright check of the panel: tabs and keys, remembered layer, instructions, tools and pickers, connections and their lines, Advanced settings and client access, contrast and the phone sheet. Fakes the API like the map check |
| `tests/browser.spec.mjs` | Optional Playwright check of the map and its link, arranging, settings and connections, the Forecasting chat, forecasts, CSV export and phone layout. Needs a stand-in runtime that answers chats |
| `index.ts` | Exports `TeamPage` |

The route is `src/app/agents/page.tsx`; `src/app/team/page.tsx` redirects to it. The proxies are `src/app/api/team/route.ts` (GET), `src/app/api/team/layout/route.ts` (PUT, DELETE) and `src/app/api/team/[agent]/route.ts` (PUT for the server agents; DELETE only for template agents), plus `src/app/api/team/templates/[agent]` (POST) and `src/app/api/team/[agent]/support` (PUT). The allowed agent ids are in `src/app/api/team/agentIds.ts`. The proxy limits these requests to 100 KB. The direct chat uses `src/app/api/agents/[agent]/chat` and `.../conversation`, allowed for `forecasting` and `customer_service` (the server answers 404 until the project adds it).

## Server counterpart

`server/src/features/team`: agent definitions, per-account settings, map layout and tool checks.

## Note for the Catalog direction

This page is the closest thing in the app to "installed capabilities". The list of agents is still hardcoded on both sides (the server's agent files in `server/agents/` and the proxy's allowlist). Pixel art and default map positions are keyed by agent id; a new agent works without them, using the fallback robot and a diagonal spread.

Pan and zoom (the wheel, pinch, drag, keys, fit and the remembered view) and the corner controls are shared with the Memory map and live in `src/common/viewport/` (`useViewport.ts`, `viewport.ts`, `MapControls.tsx`, `viewport.css`, tested by `src/common/tests/viewport.test.mjs`). The team map passes its world size, `.map-card` as the element that owns its drags, and the stamina explanation as the controls' info button. `LOW_DETAIL_ZOOM` and `viewStorageKey` stay in `services/map.ts`.
