# Catalogue images (proof of concept)

Draws every image the Catalogue mock data references as SVG and exports it to PNG with
[sharp](https://sharp.pixelplumbing.com/) (a devDependency; Next already ships it).

```
node scripts/catalogue-images/generate.mjs
```

- **What it writes:** the paths in `src/features/catalogue/data.ts`: each entry's `image`,
  each `screenshots[].src`, and the Mula publisher `avatar`. 47 files today, all under
  `public/catalogue/`. It overwrites only those, never deletes, refuses any other path, and
  fails if a file would be over 300 KB. It also fails if an entry lists a different number
  of previews than are drawn, so the data and the drawings can't drift apart.
- **Nothing external:** no image API, no downloads. Text uses the system's Helvetica
  Neue/Arial (and Georgia for the To-do previews), so output can differ slightly per machine.
- **Files:** `generate.mjs` (paths, rendering, size check), `kit.mjs` (palette and SVG/mock-UI
  helpers), `cards.mjs` (agent and app cards, avatar), `screens.mjs` (one function per preview).

## What is drawn

- **Palette:** Night #0B0B0D, Bone #F4F1EA, Ember #FF7A3D, Gold #FFC56B, plus tints mixed from them.
- **Agent cards (528×660):** the 16×16 pixel mascots from the My team map
  (`src/features/team/components/PixelAgent.tsx`, copied because Node can't import `.tsx`).
  Store has no map art, so it gets a new face under a striped shop awning in the same style.
- **App cards (720×540):** one shape motif per app: shop front (Store app), radar (Store monitor),
  sliders (Store admin), box grid (Stock sheet), receipt (Invoice maker), dotted route
  (Delivery tracker), browser window (Shop website), checkboxes (To-do).
- **Previews (1600×1000):** mock UI in Indonesian matching each caption in `data.ts`. The shop
  "Toko Sinar Pagi", its customers, products, Rupiah prices, phone numbers and bank account are
  invented; phone numbers and the bank are marked "(contoh)". No real brands, logos or store names;
  the marketplace connection is shown as a generic "marketplace". Every preview carries a
  "Contoh data" (sample data) tag.
- **Publisher avatar (64×64):** the striped-sun mark from
  `output/branding/horizon-orange-v3/symbol.svg`, in Ember on Night.
