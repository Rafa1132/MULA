# Memory (client)

The `/memory` page: the owner's notes in folders, Obsidian style, plus the one-line facts the Operator reads.

## What it does

- **Folders view (default):** the folder tree and search on the left, the open note on the right. On screens 760px wide or less, the left side is a drawer opened with the **Folders** button.
  - **Tree:** the vault's folders and notes (`buildTree`), with note counts. Every `.md` file in the account's `memory/notes/` folder is a note, including ones written in Obsidian; files the server couldn't show are listed above the tree with the reason. The generated **Facts** folder comes first: *About the business*, *About the owner* and *What the Operator reads*. Follows the ARIA tree pattern: one focusable row at a time; Up and Down move, Right opens or enters a folder, Left closes it or goes to the parent, Home and End jump, Enter or Space opens, and typing a letter jumps to the next matching row.
  - **Creating, as in Obsidian's file explorer:** the toolbar has **New note**, **New folder** and **Collapse all**. New things go into the folder last clicked (it stays highlighted), or else the open note's folder, or the top level; never the Facts folder. A name field appears right in the tree, first in that folder, filled with "Untitled" (or "Untitled 1"…) and selected, so typing replaces it. Enter or clicking away creates it; Escape cancels. A refused name (a character that breaks links, a name already used in that folder) shows the reason under the field and keeps it open. A new note is saved empty and opens in the editor with the caret in its text. Right-click on a folder (or the Menu key or Shift+F10 on any row) offers **New note** and **New folder** in that folder; right-click on the empty space below the tree makes them at the top level.
  - **Folders are real:** **New folder** creates the folder in the vault (`POST /api/memory/folders`), so an empty folder stays after a reload and shows in Obsidian.
  - **Search:** `POST /api/memory/search` returns facts and notes. A fact result opens its Facts note with the fact highlighted.
  - **Reading:** Markdown through `react-markdown`, with a small plugin (`services/markdown.ts`) that turns `[[links]]` and `#tags` into buttons. Links to notes that don't exist yet are dashed and open a "Not created yet" view that offers to create them. Selecting a tag filters the tree. Raw HTML in a note is shown as text. **Linked mentions** lists the notes and facts that link here.
  - **Editing:** title, folder (with existing folders suggested) and the text, frontmatter included. Typing `[[` lists note titles (Up and Down choose, Enter or Tab insert, Escape closes). Saving sends the version the editor started from. If the note changed elsewhere, the save is refused and the page offers the newer version instead of overwriting it. After a rename, a banner offers to update the notes that link to the old title (`relink`), each as a new version.
  - **Archive:** after confirmation. The file moves to the vault's `.trash` folder, as in Obsidian; nothing is deleted. Links to an archived note show as not created yet.
  - **Warnings:** a vault file Mula would refuse to write (frontmatter that isn't valid YAML, something that looks like a password) still opens, with a "Check this note" banner saying why.
  - **Facts:** add, correct (the old version moves to History) and retire, as before. Facts can contain `[[links]]` too.
  - **What the Operator reads:** the `MEMORY.md` summary, the facts used for the last request, and recent changes (actions and ids, never text).
- **Map view:** the **Folders** and **Map** tabs follow the ARIA tabs pattern (Left and Right switch). Folders stays mounted while the map is open, so its open folders and tag filter are kept; the map's filters live in the page, so they survive a trip to Folders and back.
  - **Drawing:** every note, Facts note and link to a note not created yet is a shape; every `[[link]]` is a line. Size grows with the number of linked notes. Each top-level folder gets a colour and a shape (`folderStyles`; colours cycle every 6 and shapes every 5, so the first 30 folders all differ even without colour), shown in the legend. Notes not created yet are hollow and dashed. The colours are `--map-0` to `--map-5` in `memory.css`, each at least 3:1 against the map in both themes.
  - **Layout:** `d3-force` (links, repulsion, collision and a pull to the centre), settled up front in `layoutGraph` (300 steps) rather than animated, so it is the same with reduced motion, deterministic (the same graph always lands the same way), and the remembered view keeps pointing at the same place. Changing a filter starts from the previous positions, so nodes shift rather than reshuffle.
  - **Pan and zoom:** the agent map's (`src/common/viewport/`): wheel, pinch, drag, `+` `-` `0` `F` and the arrow keys, the corner controls with a "How to read the map" note, and the view remembered per user under `mula.memory.view.<username>`, apart from the agent map's. Zoomed out below 60%, only the hovered note and its neighbours keep their labels; labels counter-scale so they read at 12px at every zoom.
  - **Hover and select:** hovering a note lights it, its neighbours and their lines, and dims the rest. Selecting a note opens it in Folders, with focus on the Folders tab. On touch there is no hover; a tap opens the note.
  - **Filters:** top-level folders, one tag, links to notes not created yet, notes with no links (judged on the whole graph, so hiding a folder doesn't turn its partners into orphans), and the local graph: the note last opened plus everything 1 or 2 links away, in either direction. On screens 760px wide or less the filters are a bottom sheet opened with **Filters**; Escape closes it.
  - **Text version:** the shapes are hidden from screen readers. A live summary under the map says what it shows (counts, the most-linked notes, notes with nothing shown linked), and **The map as a list** lists every shown note with what it links to and what links to it. Its buttons open the note, and focusing one lights that note on the map.

## Files

| File | Purpose |
|---|---|
| `components/MemoryPage.tsx` | Page shell: account, loading the facts overview and the graph, `run` (change, then reload both), notices |
| `components/FoldersView.tsx` | Tree and search, the open note, editing, relink, archive, the phone drawer |
| `components/FolderTree.tsx` | The ARIA tree, the inline name field for new notes and folders, and the right-click menu |
| `components/NoteView.tsx` | A note as it reads, `LinkedMentions`, and `GhostView` for links to notes that don't exist yet |
| `components/NoteEditor.tsx` | The Markdown editor with `[[` completion |
| `components/NoteMarkdown.tsx` | Markdown with clickable links and tags |
| `components/FactsNote.tsx`, `components/InspectPanel.tsx` | The Facts folder's notes |
| `components/MemoryMap.tsx` | The map: shapes and lines, hover, selection, the filter sheet, the summary and the list |
| `components/MapFilters.tsx`, `components/MapLegend.tsx` | The map's filters, and its legend and folder swatches |
| `services/notes.ts` | Note API calls and types, the tree, `[[` completion, link resolution and splitting |
| `services/markdown.ts` | The remark plugin for links and tags |
| `services/facts.ts` | Fact API calls and types |
| `services/graph.ts` | The map's rules: filters, the local graph, folder colours and shapes, node sizes, the force layout, the summary and list, the saved-view key |
| `memory.css` | Page styles. `--quiet` and `--chip-text` keep small text above 4.5:1 on raised and tinted backgrounds |
| `tests/notes.test.mjs`, `tests/graph.test.mjs` | Unit tests for the tree, completion and splitting; and for the map's filters, local graph, styles, layout and text version |
| `tests/browser.spec.mjs` | Optional Playwright check with the API faked in the browser (no accounts or database needed): tree and keys, links and ghosts, mentions, editing and `[[`, stale saves, rename and relink, facts, search, tags, the map (shapes, hover, filters, local graph, saved view, text version), contrast in both themes, the phone drawer and filter sheet |
| `index.ts` | Exports `MemoryPage` |

The route is `src/app/memory/page.tsx`. The proxies are `src/app/api/memory/route.ts` (GET), `[action]/route.ts` (POST `entries`, `search`), `entries/[id]/[action]/route.ts` (POST `supersede`, `retire`), `graph/route.ts` (GET), `notes/route.ts` (POST), `notes/[id]/route.ts` (GET, PUT) and `notes/[id]/[action]/route.ts` (POST `relink`, `archive`). Memory requests are limited to 64 KB, note saves to 200 KB.

## Server counterpart

`server/src/features/memory`: the append-only store, note parsing and versions, the save pipeline, the summary and retrieval.
