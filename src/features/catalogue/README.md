# Catalogue (prototype)

A page at `/catalogue` listing the agents and apps a business could add to Mula. It is a **prototype on mock data**: nothing here calls the backend except the usual signed-in check. Pressing **Add** on an app puts it in My apps (`src/features/apps/`) through a shared browser-side store; pressing it on an agent changes the card only until the page is reloaded.

## What is real and what is not

- `data.ts` holds every entry and is marked as mock data: card fields, `longDescription`, `price`, `screenshots` (3–4 each), and for apps `kind` (`"app"` or `"plugin"`) plus, for plugins, `parentId`. App entries also carry an `app` block (connection, last synced, used by) that My apps shows.
- **Publishers** are their own list, `PUBLISHERS` in `data.ts`, and each entry refers to one by id (`publisher: "mula"`). Every entry is Mula's for now; a third-party publisher is one more item in that list. Cards show "by Mula" with a 16 px avatar; the detail page shows a 32 px avatar, the name and, for verified publishers, an "Official" badge (icon plus text, announced as "Verified publisher"). The name is plain text, since there is no publisher page yet. Search also matches the publisher name. An unknown publisher id shows as an unverified name and logs a warning.
- **Plugins belong to a parent app.** A plugin's `parentId` is the only record of the relationship; a parent's plugins are derived from it (`services/plugins.ts`), so it is never written twice. The example is **Store app** (id `tokopedia-sync`, kept so lists already saved in a browser still work) with two placeholder plugins, Store monitor and Store admin. To-do has no plugins. Operator and Forecasting mirror the real agents in `server/agents/` and are shown as Added. The Store agent and all apps are placeholders.
- The page does not read `server/agents/` or `/api/team`. Connecting it means replacing `CATALOGUE_ENTRIES` with a backend call and saving **Add**.

## Detail page (`/catalogue/<id>`)

- **Opening it:** clicking anywhere on a card, or pressing Enter on its name, opens the entry's page. The card's name is a real link whose click area CSS stretches over the card; the Add/Open button is a sibling placed above that area, so it keeps its own action and never opens the page. An unknown id shows the 404 page.
- **Contents:** a **Back to Catalogue** link, a preview carousel, the type badge, name, short and long description, the price and status, and one primary action: **Add** for an app (through the shared added-apps store), **Open in My apps** once added, **Open** for the added agents, and a disabled **Add** for Coming soon.
- **Carousel:** one image at a time in a 16:10 frame. Previous and next buttons (labelled, wrapping around), dot buttons labelled "Show image 2 of 4" with the current one marked, a visible "2 / 4" counter announced politely, left and right arrow keys while the carousel has focus, and no autoplay. A missing image shows the cards' neutral tile.
- **Plugins for <app>:** on an app's page, its plugins as small cards (no link: this section is a plugin's page). A plugin's **Add** is disabled and reads **Add Store app first** until the parent is added; adding the parent never adds plugins. After that it shows Add, then a readable "Added". An app with none says "No plugins yet." Agents have no plugins section.
- **Plugin links:** `/catalogue/<plugin-id>` redirects on the server to `/catalogue/<parent-id>#plugins`; the page then scrolls to the section and moves focus to its heading.
- **Price:** stored as `{ amount, currency }`; 0 shows "Free" and anything else is formatted as currency, so paid apps need only a data change.

## Page behaviour

- **Search** filters live by name, description, tags and publisher name. Plugins never get cards: when a plugin matches, its parent's card is shown with a hint such as "Includes Store monitor". Matching ignores case. Every word must match, but words can match different fields. Escape clears the field. When nothing matches, the page says so and offers **Clear search**, which also returns focus to the field. A polite live region announces the number of results.
- **Cards** are picture-first: the artwork takes most of the card, with the status as a chip on the picture. Below it sit the name with a type badge, a one-sentence description (up to two lines) and one action: **Add** for Available, **Open** for Added, a disabled **Add** for Coming soon. Open follows the entry's `href`; an added app opens My apps, and a placeholder without a page shows a short notice instead.
- **Agent or app** is visible without the image or colour: agents and apps sit in separate "Agents" and "Apps" sections, agents use a tall 4:5 portrait frame and a pill badge with a person icon, and apps use a wide 4:3 tile and a squared tag with a tiles icon. A section with no search matches is hidden.
- **Images** are plain `<img>` elements (the app has no `next/image` use) in a fixed-ratio frame with `object-fit: cover`. A missing or broken image becomes a neutral tile with the entry's initial.

## Artwork to supply

The files in `public/catalogue/` are soft gradient placeholders labelled with their own name and size. Replace them with PNGs of the same name:

| File | Size |
|---|---|
| `operator.png`, `forecasting.png`, `store.png` | 800 × 1000 (4:5 portrait) |
| `tokopedia-sync.png`, `store-monitor.png`, `store-admin.png`, `stock-sheet.png`, `invoice-maker.png`, `delivery-tracker.png`, `shop-website.png`, `todo.png` | 1200 × 900 (4:3 landscape) |
| `publishers/mula.png` | 128 × 128 square, the logo's sun mark on a transparent background (shown at 16 and 32 px) |
| `<id>/1.png`, `2.png`, `3.png` for every entry, plus `4.png` for `tokopedia-sync` and `todo` (35 files) | 1600 × 1000 (16:10), detail-page previews |

Keep important detail away from the top-left corner, where the status chip sits.

## Files

`data.ts` (mock entries and types), `services/search.ts` (filtering), `components/CataloguePage.tsx`, `components/CatalogueCard.tsx`, `components/CatalogueDetailPage.tsx`, `components/Carousel.tsx` with `detail.css`, `components/PluginsSection.tsx`, `services/plugins.ts` (plugins, grid search, hints), `services/details.ts` (price, lookups, carousel wrap), `services/publishers.ts` and `components/PublisherAvatar.tsx` (publishers), `components/CatalogueImage.tsx` with `image.css` and `components/SearchField.tsx` with `search-field.css` (both shared with My apps), `catalogue.css`, `tests/search.test.mjs`, `tests/details.test.mjs`, `tests/plugins.test.mjs` and `tests/publishers.test.mjs` (run with `npm test`), `tests/browser.spec.mjs` and `tests/detail.browser.spec.mjs`.

The browser check fakes the signed-in account, so it needs only the frontend and creates no account:

```
MULA_TEST_URL=http://localhost:3000 node src/features/catalogue/tests/browser.spec.mjs
MULA_TEST_URL=http://localhost:3000 node src/features/catalogue/tests/detail.browser.spec.mjs
```
