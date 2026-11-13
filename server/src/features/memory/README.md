# Memory (server)

Each account's long-term business memory, stored as Markdown files on disk. A SQLite full-text index can be rebuilt from them at any time, and it supplies context to the Operator.

## How it is organised

The categories and files are fixed:

| Category | Files |
|---|---|
| `important-facts` | `business-identity`, `goals`, `boundaries` |
| `business-knowledge` | `products-and-services`, `suppliers`, `operating-routines` |
| `preferences` | `communication`, `working-style` |
| `fun-facts` | `interests`, `milestones` |
| `random-facts` | `miscellaneous` (the default target for `/remember`) |
| `decisions` | `current`, `superseded` |

**Essential files** (business-identity, goals, boundaries, communication) are capped at 1,500 characters and are included on every Operator turn. The other files are capped at 8,000 characters.

## Storage

- Files live at `.runtime/workspaces/<account-id>/memory/<category>/<file>.md`, plus `INDEX.md`, `changes.jsonl` (an append-only audit log) and `.lock`.
- Files saved by the app start with a `<!-- mula-memory {...} -->` line holding the source, timestamp and a hash of the body. If someone edits the file directly on disk, the hash no longer matches and the file shows as "Manual file edit".
- SQLite tables in the shared `accounts.sqlite3`:
  - `memory_documents`: a cached copy and revision of each file
  - `memory_chunks`: the FTS5 index (`unicode61`, accents removed), in chunks of about 900 characters
  - `memory_changes`: the change log
  - `memory_retrievals`: the last retrieval per account
- `sync()` re-indexes any file whose revision has changed, so the files on disk are always the source of truth.

## Safety

- File paths must be on the fixed list, and the account folder comes from the authenticated account ID, never from the client.
- Symbolic links are refused everywhere.
- Writes are atomic (temporary file, `fsync`, then rename) and happen under an exclusive `flock`.
- Saves use an optimistic revision check, so a stale save gets a 409.
- Content is sent to the model marked as owner-provided reference data, not instructions.

## Retrieval (`retrieve`)

1. Always include the non-empty essential files.
2. Extract keywords from the question. Stop words are removed in both English and Bahasa Indonesia, and at most 24 terms are kept.
3. Run an FTS5 `MATCH` query with an OR of the terms, ranked by `bm25`.
4. Add up to **3** matching chunks that aren't from essential files. `decisions/superseded.md` is never included automatically.
5. Record the retrieval so the Memory page can show what was used.

`context_for(sources)` formats the result as a JSON block that gets appended to the Operator's system prompt.

## Endpoints

| Method | Path | Body |
|---|---|---|
| GET | `/api/memory` | — returns files, categories, folder path, last retrieval, changes |
| PUT | `/api/memory/document` | `{ path, content (≤8,000), revision }` |
| POST | `/api/memory/search` | `{ question (≤1,000) }` returns up to 8 chunks |

## Service functions used by other features

`retrieve`, `context_for`, `remember_command` (parses `/remember [path |] fact`) and `write_document(..., append=True)`. All are called by `features/operator`.

## Files

`routes.py`, `service.py`, `tests/test_memory.py`. `__init__.py` is intentionally empty: `main.py` imports `routes` directly. See also `docs/memory-and-sqlite.md`.

## Limits

- Retrieval is keyword-based only. There are no embeddings or semantic search.
- Memory is never inferred automatically from chats or CSVs; only explicit saves are kept.
- Saved chat transcripts and CSVs aren't indexed.
