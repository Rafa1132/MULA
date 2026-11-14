# Memory (client)

The `/memory` page, where the owner reads what Mula remembers, adds facts, corrects or retires them, and sees the history.

## What it does

- Loads `/api/memory`: the regenerated summary, every entry (current and superseded, with `related` ids for overlapping facts), the last 30 audit rows and the last retrieval.
- **Add memory:** a target (about the business or about the owner) and one fact, `POST /api/memory/entries`. A near-duplicate is reported with the existing id instead of being saved twice; a refused fact shows the reason.
- **Correct:** opens the fact inline and posts the new version to `/api/memory/entries/{id}/supersede`. The old version moves to that section's collapsed **History**, marked "Replaced by [id]".
- **Retire:** confirms, then `POST /api/memory/entries/{id}/retire`. The fact leaves the summary and retrieval and stays in the history.
- Shows the summary the Operator reads (`MEMORY.md`), **Try retrieval** (`POST /api/memory/search`, index only, no model call), the facts used for the Operator's last request, and the recent changes (actions and ids, never fact text).

## Files

| File | Purpose |
|---|---|
| `components/MemoryPage.tsx` | Page, add form, the two timelines with history, summary, retrieval inspector and change log |
| `memory.css` | Page styles |
| `tests/browser.spec.mjs` | Optional Playwright check: add, duplicate, refusal, correct, retire, search, phone layout |
| `index.ts` | Exports `MemoryPage` |

The route is `src/app/memory/page.tsx`. The proxies are `src/app/api/memory/route.ts` (GET), `src/app/api/memory/[action]/route.ts` (POST `entries`, `search`) and `src/app/api/memory/entries/[id]/[action]/route.ts` (POST `supersede`, `retire`). The proxy limits memory requests to 64 KB.

## Server counterpart

`server/src/features/memory`: the append-only store, the save pipeline, the summary and retrieval.
