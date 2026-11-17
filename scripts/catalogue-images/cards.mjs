// Card images: a pixel mascot per agent (528×660) and an illustrated tile with its own
// shape motif per app (720×540). No words on the cards; the Catalogue prints the name.
import { PALETTE as P, circle, line, path, rect, svg } from "./kit.mjs";

// Copied from src/features/team/components/PixelAgent.tsx (a .tsx file Node can't import),
// so the cards match the My team map. "store" is new, in the same style: a face under a
// striped shop awning. "." is transparent.
const PIXEL_COLOURS = {
  k: "#2b2019", y: "#f9c74f", o: "#f26b1d", d: "#d9541a", b: "#5bb5d8", c: "#3d93b5",
  g: "#c9c3d6", h: "#a8a1b8", e: "#FF7A3D", w: "#F4F1EA",
};
const PIXEL_ART = {
  operator: [
    ".......yy.......", ".......yy.......", ".......kk.......", "..kkkkkkkkkkkk..",
    ".kooooooooooook.", ".kooooooooooook.", ".kookkooookkook.", ".kookkooookkook.",
    ".kooooooooooook.", ".koookooookoook.", ".kooookkkkooook.", ".kddddddddddddk.",
    ".kddddddddddddk.", "..kkkkkkkkkkkk..", "...kd...........", "...k............",
  ],
  forecasting: [
    "...........yy...", ".......yy..yy...", "...yy..yy..yy...", "..kkkkkkkkkkkk..",
    ".kbbbbbbbbbbbbk.", ".kbbbbbbbbbbbbk.", ".kbbkkbbbbkkbbk.", ".kbbkkbbbbkkbbk.",
    ".kbbbbbbbbbbbbk.", ".kbbbkbbbbkbbbk.", ".kbbbbkkkkbbbbk.", ".kcccccccccccck.",
    ".kcccccccccccck.", "..kkkkkkkkkkkk..", "................", "................",
  ],
  store: [
    "..kkkkkkkkkkkk..", ".keewweewweewwk.", ".keewweewweewwk.", "kkkkkkkkkkkkkkkk",
    ".kggggggggggggk.", ".kggggggggggggk.", ".kggkkggggkkggk.", ".kggkkggggkkggk.",
    ".kggggggggggggk.", ".kgggkggggkgggk.", ".kggggkkkkggggk.", ".khhhhhhhhhhhhk.",
    ".khhhhhhhhhhhhk.", "..kkkkkkkkkkkk..", "................", "................",
  ],
};

/** One rect per run of same-coloured pixels, as PixelAgent does, so there are no seams. */
function pixels(rows, x, y, cell) {
  let out = "";
  rows.forEach((row, rowIndex) => {
    let column = 0;
    while (column < row.length) {
      const key = row[column];
      let end = column;
      while (end < row.length && row[end] === key) end += 1;
      if (key !== ".") out += rect(x + column * cell, y + rowIndex * cell, (end - column) * cell, cell, PIXEL_COLOURS[key]);
      column = end;
    }
  });
  return out;
}

// Each agent gets its own backdrop motif behind the mascot.
const AGENT_SCENES = {
  operator: { sky: P.night, sun: P.ember, motif: () => [0, 1, 2].map((i) => circle(264, 300, 150 + i * 46, "none", { stroke: P.gold, strokeWidth: 3, opacity: 0.5 - i * 0.14 })).join("") },
  forecasting: { sky: "#14161C", sun: P.gold, motif: () => [60, 110, 90, 150, 130, 200, 250].map((h, i) => rect(30 + i * 72, 540 - h, 40, h, P.ember, { r: 6, opacity: 0.35 + i * 0.07 })).join("") },
  store: { sky: P.night, sun: P.gold, motif: () => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => rect(i * 66, 0, 33, 74, P.ember, { opacity: 0.85 })).join("") + rect(0, 74, 528, 10, P.gold) },
};

export function agentCard(id) {
  const W = 528;
  const H = 660;
  const scene = AGENT_SCENES[id];
  let out = rect(0, 0, W, H, scene.sky);
  out += circle(264, 300, 150, scene.sun, { opacity: 0.95 });
  out += scene.motif();
  // The ground: a band of Bone the mascot stands on.
  out += rect(0, 540, W, 120, P.bone) + rect(0, 540, W, 8, P.gold);
  // 16×16 art at 18 px per pixel, centred, with its lowest drawn row resting on the ground.
  const rows = PIXEL_ART[id];
  let lastRow = rows.length - 1;
  while (lastRow > 0 && !/[^.]/.test(rows[lastRow])) lastRow -= 1;
  const top = 548 - (lastRow + 1) * 18;
  out += rect(140, 538, 248, 18, "#000000", { r: 9, opacity: 0.16 });
  out += pixels(rows, 120, top, 18);
  return svg(W, H, out);
}

// App tiles: 720×540, each with a distinct shape motif.
const APP_MOTIFS = {
  // Store app: a shop front with a striped awning and stacked parcels.
  "tokopedia-sync": () => rect(0, 0, 720, 540, P.night)
    + circle(560, 150, 92, P.gold)
    + rect(170, 230, 380, 230, P.bone, { r: 10 })
    + [0, 1, 2, 3, 4, 5].map((i) => path(`M${150 + i * 70} 230h70v40a35 35 0 0 1-70 0Z`, { fill: [P.ember, P.bone][i % 2] })).join("")
    + rect(140, 205, 440, 30, P.ember, { r: 8 })
    + rect(220, 320, 110, 140, P.night, { r: 6 }) + rect(370, 320, 130, 80, P.gold, { r: 6 })
    + rect(560, 400, 80, 60, P.ember, { r: 6 }) + rect(585, 350, 55, 50, P.gold, { r: 6 }),
  // Store monitor: radar rings and a sweep, with blips.
  "store-monitor": () => rect(0, 0, 720, 540, "#101114")
    + [70, 140, 210].map((r) => circle(360, 280, r, "none", { stroke: P.bone, strokeWidth: 3, opacity: 0.35 })).join("")
    + path("M360 280 L560 180 A220 220 0 0 1 580 300Z", { fill: P.ember, opacity: 0.55 })
    + line(360, 280, 560, 180, P.ember, 5)
    + circle(360, 280, 12, P.gold) + circle(470, 200, 14, P.gold) + circle(270, 360, 10, P.ember) + circle(430, 400, 9, P.bone),
  // Store admin: mixing-desk sliders.
  "store-admin": () => rect(0, 0, 720, 540, P.bone)
    + [0, 1, 2, 3, 4].map((i) => line(170 + i * 95, 110, 170 + i * 95, 430, P.night, 8)).join("")
    + [0, 1, 2, 3, 4].map((i) => rect(140 + i * 95, [160, 300, 220, 350, 190][i], 60, 34, [P.ember, P.gold, P.night, P.ember, P.gold][i], { r: 10 })).join(""),
  // Stock sheet: a grid of boxes, a few highlighted.
  "stock-sheet": () => rect(0, 0, 720, 540, P.gold)
    + Array.from({ length: 20 }, (_, i) => {
      const column = i % 5;
      const row = Math.floor(i / 5);
      let fill = P.bone;
      if ([3, 7, 14].includes(i)) fill = P.ember;
      if ([10, 18].includes(i)) fill = P.night;
      return rect(130 + column * 96, 90 + row * 96, 80, 80, fill, { r: 12 });
    }).join(""),
  // Invoice maker: a receipt with a zigzag edge.
  "invoice-maker": () => rect(0, 0, 720, 540, P.ember)
    + path("M230 60h260v380l-26 20-26-20-26 20-26-20-26 20-26-20-26 20-26-20-26 20-26-20Z", { fill: P.bone })
    + [130, 170, 210, 250].map((y, i) => rect(270, y, [180, 140, 160, 110][i], 14, P.night, { r: 7, opacity: 0.8 })).join("")
    + line(270, 310, 450, 310, P.night, 3, { dash: "8 8" })
    + rect(370, 340, 80, 24, P.gold, { r: 8 })
    + circle(560, 120, 46, P.gold, { opacity: 0.9 }),
  // Delivery tracker: a dotted route between pins.
  "delivery-tracker": () => rect(0, 0, 720, 540, P.night)
    + path("M120 420 C 220 260, 330 460, 420 300 S 560 140, 610 120", { stroke: P.bone, width: 6, opacity: 0.9 }).replace("/>", ' stroke-dasharray="2 18"/>')
    + circle(120, 420, 24, P.gold) + circle(610, 120, 30, P.ember) + circle(610, 120, 11, P.night)
    + rect(380, 270, 80, 54, P.ember, { r: 8 }) + rect(460, 290, 34, 34, P.gold, { r: 6 }),
  // Shop website: a browser window with product tiles.
  "shop-website": () => rect(0, 0, 720, 540, P.bone)
    + rect(120, 80, 480, 380, P.white, { r: 18, stroke: P.night, strokeWidth: 5 })
    + rect(120, 80, 480, 56, P.night, { r: 18 }) + rect(120, 116, 480, 20, P.night)
    + [0, 1, 2].map((i) => circle(150 + i * 26, 108, 7, [P.ember, P.gold, P.bone][i])).join("")
    + rect(160, 170, 400, 90, P.ember, { r: 12 })
    + [0, 1, 2].map((i) => rect(160 + i * 140, 290, 120, 130, [P.gold, P.night, P.gold][i], { r: 12 })).join(""),
  // To-do: a stack of ticked checkboxes.
  todo: () => rect(0, 0, 720, 540, P.bone)
    + [0, 1, 2].map((i) => {
      const y = 120 + i * 110;
      let box = rect(170, y, 70, 70, "none", { r: 16, stroke: P.night, strokeWidth: 6 });
      if (i < 2) box = rect(170, y, 70, 70, P.ember, { r: 16 }) + path(`M188 ${y + 36}l14 14 22-26`, { stroke: P.night, width: 8 });
      let bar = rect(270, y + 22, 280 - i * 40, 26, P.night, { r: 13 });
      if (i < 2) bar = rect(270, y + 22, 280 - i * 40, 26, P.night, { r: 13, opacity: 0.25 });
      return box + bar;
    }).join("")
    + circle(590, 110, 40, P.gold),
};

export function appCard(id) {
  const motif = APP_MOTIFS[id];
  if (!motif) throw new Error(`No card motif for app ${id}`);
  return svg(720, 540, motif());
}

/** The publisher avatar: the Mula striped-sun mark (output/branding/horizon-orange-v3/symbol.svg) in Ember on Night. */
export function mulaAvatar() {
  // The symbol's own geometry spans 8..248 × 36..254; scaled into a 64 px tile with margin.
  const mark = '<g fill="#FF7A3D"><path d="M33 131a95 95 0 0 1 190 0Z M34 149h188l-5 23H39Z M46 190h164l-12 23H58Z"/><rect x="8" y="231" width="240" height="23" rx="11.5"/></g>';
  return svg(64, 64, rect(0, 0, 64, 64, P.night) + `<g transform="translate(9 6) scale(0.18)">${mark}</g>`);
}
