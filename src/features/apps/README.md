# My apps (prototype)

A page at `/apps` showing the apps and websites the owner has added from the Catalogue: whether each one is working, when it last synced, which agents use it, and what to do with it. It is a **prototype on mock data** and calls no backend except the usual signed-in check. Agents are not listed here; they stay on My agents.

## Shared state with the Catalogue

`services/addedApps.ts` is the only code that knows where the added list lives. Both pages use `useAddedApps()` to read it and `addApp()` / `removeApp()` to change it, so **Add** in the Catalogue and **Remove** here stay in step, including across tabs.

- Today the list is saved in this browser's localStorage under `mula.prototype.project.<project id>.added-apps`, one list per project. Lists saved before projects (under `mula.prototype.added-apps`) are left in place but no longer shown. Every read and write is wrapped in try/catch: blocked or full storage keeps the list working for the visit and logs a warning, and corrupt data starts empty.
- Only App entries that can be added are accepted. Agents, unknown ids and Coming soon apps are refused, and so is a plugin whose parent app is not added. Removing a parent removes its plugins; a saved plugin whose parent is missing is dropped when the list is read.
- Moving to a backend means replacing this one module; the pages don't touch storage.

## Page behaviour

- **Summary** at the top: the number of apps and how many need attention.
- **Cards** in a grid, problems first (Needs attention, then Not connected, then Connected, then by name). Each card shows the image in the Catalogue's frame and fallback, the name, a one-line description, the connection state with its own icon and words, a note for Needs attention, the last sync time and the agents that use the app. Added plugins are listed inside their parent's card under "Plugins", never as cards of their own.
- **Actions:** for an app with a `launchUrl` (To-do, see `todo/README.md`), Open (primary) is a real link that opens the app in a new tab. For the others, Open and Settings show a notice, since those pages don't exist yet. **Remove** asks for confirmation inside the card: focus moves to **Keep it**, Escape cancels and returns focus to Remove, and **Yes, remove** sends the app back to Available in the Catalogue and moves focus to the page heading. For an app with added plugins the question adds "This also removes 2 plugins.", and the notice afterwards says they went too.
- **Search** reuses the Catalogue's search field and filters by name and description.
- **Empty states:** with nothing added, the page explains what My apps is for and links to the Catalogue; with no search matches it offers Clear search.
- **Contrast:** small grey text uses a slightly darker grey than the shared `--muted`, which measures 4.42:1 on the page background. Every text colour here measures at least 4.5:1 in both themes.

## Data

Connection details are the `app` block on App entries in `src/features/catalogue/data.ts` (mock data): `connection` (`connected`, `needs_attention`, `not_connected`), `lastSynced` (an ISO time or null), `usedBy` (agent ids) and an optional `attentionNote`. It is named `connection` because `status` already means Available, Added or Coming soon in the Catalogue.

## Files

`components/AppsPage.tsx`, `components/AppCard.tsx`, `services/addedApps.ts` (the store), `services/myApps.ts` (sorting, search, labels), `apps.css`, `tests/addedApps.test.mjs` and `tests/myApps.test.mjs` (run with `npm test`), `tests/browser.spec.mjs`.

The browser check fakes the signed-in account and uses a fresh browser profile, so it needs only the frontend:

```
MULA_TEST_URL=http://localhost:3000 node src/features/apps/tests/browser.spec.mjs
```
