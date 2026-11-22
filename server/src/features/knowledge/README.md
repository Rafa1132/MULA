# Knowledge base

A project's knowledge base: the only facts the Customer Service agent may tell customers. The owner edits
it on the Knowledge base page (`src/features/knowledge`); the agent reads it with its `knowledge_search`
tool and in every customer turn (`support/service.py`).

## Entries (`knowledge_entries`, migration `0006_customer_service`)

| Field | Rule |
|---|---|
| `kind` | `product`, `faq`, `hours` or `policy` |
| `title` | 1–200 characters |
| `body` | 1–4,000 characters |
| `price` | optional, up to 60 characters of free text (for example `Rp 25.000`) |

At most 500 entries per project (`MAX_ENTRIES`, 409 beyond). A generated `tsvector` column (`'simple'`
configuration, so Indonesian and English both work) has a GIN index.

## Search (`service.search`)

- A base of up to 30 entries (`SMALL_BASE`) is given whole: cheaper and more reliable than ranking a few rows.
- Larger bases: Postgres full-text search (`plainto_tsquery`), then a `LIKE` on each word when that finds nothing.
- `format_entries` caps what one turn receives at 12,000 characters, so a long base can't crowd out the chat.

## Grounding guard (`grounding.py`)

`unsupported_numbers(reply, *sources)` returns every number of two or more digits in a reply that appears in
neither the knowledge base nor the customer's message (`25.000`, `25,000` and `25000` compare equal). A reply
with any is never sent: the customer gets the handoff reply and the owner a ticket. This backs up the prompt
for prices, stock and times; it doesn't check words, so wording-level invention is limited by the prompt and
the knowledge-base-only context, not guaranteed.

## API (`routes.py`, scoped to the `X-Mula-Project` project)

`GET /api/knowledge` (entries plus kind labels), `POST /api/knowledge` (201), `PATCH`/`DELETE
/api/knowledge/{id}`. Strict models; another project's entry is 404. Validation errors list field names and
rules only, never the submitted text (`main.py`).

Tests: `tests/test_knowledge.py`.
