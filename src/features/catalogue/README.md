# Catalogue (prototype)

A page at `/catalogue` listing the agents and apps a business could add to Mula. It is a **prototype on mock data**: nothing here calls the backend except the usual signed-in check, and pressing **Add** changes the card only until the page is reloaded.

## What is real and what is not

- `data.ts` holds every entry and is marked as mock data. Operator and Forecasting mirror the real agents in `server/agents/` and are shown as Added. The Store agent and all apps are placeholders.
- The page does not read `server/agents/` or `/api/team`. Connecting it means replacing `CATALOGUE_ENTRIES` with a backend call and saving **Add**.

## Page behaviour

- **Search** filters live by name, description and tags, ignoring case. Every word must match, but words can match different fields. Escape clears the field. When nothing matches, the page says so and offers **Clear search**, which also returns focus to the field. A polite live region announces the number of results.
- **Cards** are picture-first: the artwork takes most of the card, with the status as a chip on the picture. Below it sit the name with a type badge, a one-sentence description (up to two lines) and one action: **Add** for Available, **Open** for Added, a disabled **Add** for Coming soon. Open follows the entry's `href`; a placeholder without a page shows a short notice instead.
- **Agent or app** is visible without the image or colour: agents and apps sit in separate "Agents" and "Apps" sections, agents use a tall 4:5 portrait frame and a pill badge with a person icon, and apps use a wide 4:3 tile and a squared tag with a tiles icon. A section with no search matches is hidden.
- **Images** are plain `<img>` elements (the app has no `next/image` use) in a fixed-ratio frame with `object-fit: cover`. A missing or broken image becomes a neutral tile with the entry's initial.

## Artwork to supply

The files in `public/catalogue/` are soft gradient placeholders labelled with their own name and size. Replace them with PNGs of the same name:

| File | Size |
|---|---|
| `operator.png`, `forecasting.png`, `store.png` | 800 × 1000 (4:5 portrait) |
| `tokopedia-sync.png`, `stock-sheet.png`, `invoice-maker.png`, `delivery-tracker.png` | 1200 × 900 (4:3 landscape) |

Keep important detail away from the top-left corner, where the status chip sits.

## Files

`data.ts` (mock entries and types), `services/search.ts` (filtering), `components/CataloguePage.tsx`, `components/CatalogueCard.tsx`, `components/CatalogueImage.tsx`, `catalogue.css`, `tests/search.test.mjs` (runs with `npm test`), `tests/browser.spec.mjs`.

The browser check fakes the signed-in account, so it needs only the frontend and creates no account:

```
MULA_TEST_URL=http://localhost:3000 node src/features/catalogue/tests/browser.spec.mjs
```
