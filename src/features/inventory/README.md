# Inventory (client)

The **Inventory** page (`/projects/<id>/inventory`, and `/inventory` for the first project). It is the one list of everything a project (a *workspace*) owns or has installed, and the only source the **Add agent** form in My agents (`features/team`) picks from.

## What it lists

Grouped by type, in this order:

| Type | Where it comes from today | Status |
|---|---|---|
| **Tools** | Each agent's `available_tools` in `/api/team`, plus the runtime toolsets their files offer (`available_toolsets`, id `toolset:<name>`) | *Installed*; a toolset whose `toolset_status` is `needs_setup` is *Needs setup* |
| **Skills** | Samples only (Mula has no skills yet) | *Needs setup*, labelled *Sample* |
| **Connectors** | Samples only (Google Docs, Microsoft Excel, Shopify) | *Needs setup*, labelled *Sample* |
| **Models** | The brains in `available_brains` (id `model:<brain>`) | Local: *Installed*; cloud: *Connected*; a brain whose provider script hasn't been run: *Needs setup* |

Each item has an id, the workspace id, name, type, status (`installed`, `connected`, `needs_setup`, `error`), source (`built-in`, `marketplace`, `custom`), description, the config it needs (`ConfigField`: a label and whether it is required or secret; secret values are never shown or stored in the browser), a setup hint, its side effects (`sends_messages`, `moves_money`, `changes_data`) and, for models, whether it is the default. The default model is the Operator's brain, or the first usable model. Samples are listed so the shape is clear but can never be chosen.

## The page

- Search (name, description or id, case-insensitive), a **Type** filter and a **Status** filter; the "N of M items" count is announced as it changes.
- Each card shows the status as a dot *and* a word (solid dot: working; hollow: needs setup; warning colour: error), the source, *Default model* or *Sample* tags, what it needs and how to set it up.
- Empty states: an empty inventory offers **Browse the catalogue**; filters with no results offer **Clear filters**.
- `?item=<id>` (the Add agent form's **Set up** links) scrolls to that card, highlights it and moves focus to it.
- Inter Tight (`common/styles/fonts.ts`) and the app's theme tokens; buttons are ink, never mint (mint is the orchestrator's). Single column on phones, no sideways scrolling at 360 px.

## Data layer

Pages call only `listInventory(workspaceId)` in `services/inventory.ts`. Today it reads `/api/team` and builds the list with `inventoryFromTeam()` (pure, tested). When the server gets its own endpoint (for example `GET /api/inventory`), only `listInventory` changes.

## How agents relate to the inventory (`services/correlation.ts`)

1. An agent may only reference items that exist in its own workspace (`findInWorkspace` never matches another workspace's item). The Add agent form also requires them to be installed or connected.
2. If an item an agent uses is removed, or is no longer installed or connected, `referenceIssues()` reports it and the agent shows a **Check inventory** badge (`warningText()`) and an explanation in its detail. The agent is never deleted or rewritten.
3. Deleting an agent never touches the inventory: agents hold only item ids.

## Files

| File | Purpose |
|---|---|
| `types.ts` | Shared types: `InventoryItem`, `ConfigField`, statuses, `InventoryReferences` (what agents point at) |
| `services/inventory.ts` | `listInventory`, `inventoryFromTeam`, samples, filters, groups, `setupLink` |
| `services/correlation.ts` | The agent ↔ inventory rules and warning text |
| `components/InventoryPage.tsx` | The page: loading, sign-in, filters, groups, empty states |
| `components/InventoryFilters.tsx`, `InventoryItemCard.tsx`, `StatusPill.tsx` | Its parts |
| `inventory.css` | Styles |
| `tests/` | `inventory.test.mjs`, `correlation.test.mjs` (with `fixtures.mjs`) |

`npm test` runs the tests. Agents added with the form are documented in `features/team/README.md`.
