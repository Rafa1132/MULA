# Knowledge base (client)

The **Knowledge base** page (`/projects/<id>/knowledge`, and `/knowledge` for the first project): what the
Customer Service agent may tell customers. It is linked from Inventory (the Knowledge base card), the Inbox
and the agent's Customer service tab. Backend: `server/src/features/knowledge/README.md`.

- Entries grouped by kind, every kind shown even when empty: **Products and services** (with an optional
  price), **FAQ**, **Opening hours**, **Policies**. Add, Edit and Delete (with a confirm) in place.
- While the base is empty, a note says that every customer message goes to the owner.
- Errors show next to their field after the first Save attempt; the server's message is shown when it refuses.
- Theme tokens and Inter Tight; buttons are ink, never mint. One column on phones, no sideways scrolling at 360 px.

| File | Purpose |
|---|---|
| `services/knowledge.ts` | API calls, limits (mirroring the server's `EntryInput`), `validateEntry`, `groupByKind` |
| `components/KnowledgePage.tsx`, `EntryForm.tsx` | The page and the add/edit form |
| `knowledge.css` | Styles |
| `tests/knowledge.test.mjs` | Validation, trimming, grouping |

Proxy routes: `src/app/api/knowledge/**` (ids checked as 32 hex characters, 24 KB body cap).
