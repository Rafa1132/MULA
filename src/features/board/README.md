# Board page

`/projects/<id>/board`, after Chat in the sidebar. Four columns (To do, Working, Needs you, Done) of the
project's cards, from `/api/board` (see `server/src/features/board/README.md`).

- `services/columns.ts`: pure grouping, labels and which actions a card offers (unit tested).
- `services/board.ts`: the API calls, through `projectFetch`; card ids are checked before a URL is built.
- `components/BoardPage.tsx`: the page shell (same as Inventory); reloads every 10 s while a card is Working.
- `components/NewCardDialog.tsx`, `CardPanel.tsx`, `CardTile.tsx`.

Moving a card is done with buttons, not drag-and-drop, so running an agent is always a deliberate Start.
Start shows only when the card has an agent, with a note that a cloud brain may use credits. Buttons are
ink; mint is reserved for the orchestrator.
