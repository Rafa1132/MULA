# Mula memory and SQLite

## Open your memory

Restart the running Mula app after updating, then select **Memory** from the sidebar (or the Memory link on mobile). `/memory` requires your account login. Each account has its own files:

```text
.runtime/workspaces/<account-id>/memory/
├── INDEX.md
├── important-facts/
│   ├── business-identity.md
│   ├── goals.md
│   └── boundaries.md
├── business-knowledge/
│   ├── products-and-services.md
│   ├── suppliers.md
│   └── operating-routines.md
├── preferences/
│   ├── communication.md
│   └── working-style.md
├── fun-facts/
│   ├── interests.md
│   └── milestones.md
├── random-facts/
│   └── miscellaneous.md
├── decisions/
│   ├── current.md
│   └── superseded.md
└── changes.jsonl
```

The tree is initialized with empty documents, not invented facts. `changes.jsonl` is created on the first app-managed save and records timestamps, source labels and hashes without keeping deleted fact text. `INDEX.md` is a generated navigation guide. Hidden `.lock` and `.initialized` files coordinate application writes.

Use the editor to add confirmed facts, save corrections, or clear a file. Each saved file includes a first-line HTML comment with source, time, confirmation status and a body hash. The page edits the body while preserving this metadata. Markdown is displayed as plain editable text. You may also edit these UTF-8 files on disk; modified bodies are recognized as manual file edits. Their contents are re-indexed on the next Memory read, search or chat request. Renaming files or adding arbitrary new filenames is not supported; only the predefined tree is indexed. Empty files hold no facts. If a file is deleted on disk, it is removed from search on the next synchronization.

Essential files (the three Important facts files and communication preferences) allow 1,500 characters each and are supplied in full when non-empty. Other files allow 8,000 characters and are indexed in overlapping chunks. Long notes should be summarized into durable facts rather than pasted as entire transcripts. Oversized or unreadable manually edited files cause an explicit error until corrected; they are not silently truncated.

## Save from chat

Only explicit commands write memory. Other conversation and CSV contents are not automatically promoted into saved facts.

```text
/remember Our coffee supplier is Aroma.
```

That appends to `random-facts/miscellaneous.md`. To choose another file:

```text
/remember business-knowledge/suppliers.md | Our coffee supplier is Aroma. Deliveries arrive on Tuesdays.
```

The filename must match the tree. Exact repeated paragraphs are not appended twice. The save happens before the model request and can succeed even if the model reply later fails; check the Memory page before retrying. Normal chat messages never silently change confirmed memory. Owner preferences in these files do not grant tool permissions or authorize business actions.

## How retrieval works

Markdown files are the source of truth. SQLite FTS5 is a rebuildable keyword index, with BM25 ranking and account filtering. There are no embeddings, vector database, PostgreSQL, or external retrieval services.

For each question:

1. Read and synchronize the authenticated account's whitelisted files.
2. Include non-empty essential files.
3. Search remaining files for useful question keywords and add up to three matching chunks (900 characters each, with overlap). This is lexical retrieval, so synonyms and paraphrases can miss relevant notes.
4. Add the selected memory as current system reference context along with the Operator instructions. Saved memory is not pasted into the persisted user question. The configured runtime toolset stays empty.
5. Record the selected sources for inspection and show their paths with the user message in chat.

`decisions/superseded.md` remains searchable in the Memory page but is excluded from automatic retrieval. The **Memory used for the last request** panel shows the exact memory subset sent on the most recent request, including entries supplied consistently. It is not the entire model prompt or a complete view of the model's learned knowledge. Recent conversation, instructions and CSV context are separate inputs.

Clearing or changing a file updates future retrieval. Prior conversation answers and last-request snapshots can still contain old facts. Correcting memory does not erase those histories or guarantee that a model will never repeat an older fact. Sources and revisions in the snapshot make those differences inspectable.

## Inspect the SQLite database

SQLite is already available through the app's Python environment. On this Mac the `sqlite3` command is also installed. Open the database in read-only mode:

```sh
cd /Users/rafa/Desktop/LARAS
sqlite3 -readonly .runtime/accounts.sqlite3
```

Inside SQLite, use:

```sql
.headers on
.mode column
.tables
.schema memory_documents
```

List accounts without exposing password hashes or session tokens:

```sql
SELECT id, username FROM accounts;
```

Inspect one account's non-empty memories (replace `rafa` with your username):

```sql
SELECT path, source, updated_at, content
FROM memory_documents
WHERE account_id = (SELECT id FROM accounts WHERE username = 'rafa')
  AND content <> '';
```

Search that account's indexed notes:

```sql
SELECT path, content
FROM memory_chunks
WHERE memory_chunks MATCH 'coffee OR supplier'
  AND account_id = (SELECT id FROM accounts WHERE username = 'rafa');
```

Inspect memory changes and the most recent retrieval:

```sql
SELECT path, action, source, occurred_at
FROM memory_changes
WHERE account_id = (SELECT id FROM accounts WHERE username = 'rafa')
ORDER BY id DESC LIMIT 20;

SELECT question, occurred_at, sources
FROM memory_retrievals
WHERE account_id = (SELECT id FROM accounts WHERE username = 'rafa');
```

Exit with:

```text
.quit
```

`memory_documents` mirrors the files; `memory_chunks` is the FTS search index. `memory_changes` is the app-managed audit metadata, and `memory_retrievals` keeps one last-request snapshot per account. Direct file edits are detected during sync, but do not pretend to be app-managed audit events. Do not edit index tables to change memory: the next sync can replace them. Edit the Markdown files or use the Memory page instead. If `LARAS_ACCOUNT_DB` is set, use that database path; workspace files are placed next to that database in `workspaces/` for isolation in tests and custom installations.

## Implementation boundaries

Paths and search results are account-scoped; no account ID is accepted from the client to select another workspace. The predefined tree prevents arbitrary path access, and symlinked memory directories/files are rejected. Files use owner-only permissions and are ignored by Git under `.runtime`. Writes are atomic per file and serialized per account with a filesystem lock. UI saves use revision hashes to reject conflicting edits. A person editing files outside the app does not participate in its lock, so avoid simultaneous external/app edits. SQLite is rebuilt from files after a partial indexing failure; this is not a distributed transaction or multi-server storage solution.
