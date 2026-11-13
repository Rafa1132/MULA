# Memory (client)

The `/memory` page, where the owner browses, edits and tests the account's categorized business memory.

## What it does

- Loads `/api/memory` to get the file tree, each file's content and metadata, the 20 most recent changes, and the last retrieval the Operator ran.
- Opens one document at a time for editing. **Save** sends the file's `revision` with `PUT /api/memory/document`. If the file changed elsewhere (another tab, or a direct edit on disk), the server returns 409 and the page asks the user to reload rather than overwrite.
- **Clear** saves an empty document.
- **Try retrieval** posts a question to `/api/memory/search` and lists the matching notes. It uses the search index only, without calling the model.
- Explains the chat shortcuts: `/remember Your fact` saves to Random facts, and `/remember business-knowledge/suppliers.md | Our supplier is Aroma.` saves to a chosen file.

## Files

| File | Purpose |
|---|---|
| `components/MemoryPage.tsx` | Page, editor, retrieval inspector and change log |
| `memory.css` | Page styles |
| `index.ts` | Exports `MemoryPage` |

The route is `src/app/memory/page.tsx`. The proxies are `src/app/api/memory/route.ts` (GET) and `src/app/api/memory/[action]/route.ts` (PUT `document`, POST `search`). The proxy limits memory requests to 64 KB.

## Server counterpart

`server/src/features/memory`: the Markdown files, the SQLite FTS5 index, and retrieval.
