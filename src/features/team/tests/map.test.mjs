import assert from "node:assert/strict";
import test from "node:test";
import { CARD, CARD_GAP, CARD_LEDGE, DEFAULT_POSITIONS, WORLD, agentLinks, agentStatus, cardRect, centreOf, clampFraction, clampPosition, clampToCanvas, dragTo, freeSpot, initialLayout, isDrag, nudge, overlaps, positionFor, settleLayout, viewStorageKey } from "../services/map.ts";

test("saved positions win, then defaults, then a spread for new agents", () => {
  assert.deepEqual(positionFor("operator", { operator: { x: 0.9, y: 0.1 } }, 0), { x: 0.9, y: 0.1 });
  assert.deepEqual(positionFor("forecasting", {}, 1), DEFAULT_POSITIONS.forecasting);
  const first = positionFor("inventory", {}, 2);
  const second = positionFor("procurement", {}, 3);
  assert.notDeepEqual(first, second);
  for (const position of [first, second]) {
    assert.ok(position.x > 0 && position.x < 1 && position.y > 0 && position.y < 1);
  }
});

test("fractions are clamped, including non-finite values", () => {
  assert.equal(clampFraction(1.4), 1);
  assert.equal(clampFraction(-2), 0);
  assert.equal(clampFraction(Number.NaN, 0.2, 0.8), 0.2);
  assert.equal(clampFraction(0.5, 0.2, 0.8), 0.5);
});

test("the whole card stays on the canvas", () => {
  const canvas = { width: 1000, height: 600 };
  const card = { width: 200, height: 240 };
  assert.deepEqual(clampToCanvas({ x: 0, y: 1 }, canvas, card), { x: 0.1, y: 0.8 });
  assert.deepEqual(clampToCanvas({ x: 0.5, y: 0.5 }, canvas, card), { x: 0.5, y: 0.5 });
  // A canvas narrower than the card centres it instead of producing an inverted range.
  assert.deepEqual(clampToCanvas({ x: 0.9, y: 0.1 }, { width: 100, height: 100 }, card), { x: 0.5, y: 0.5 });
});

test("positions are fractions of the world; cards stay inside it", () => {
  assert.deepEqual(centreOf({ x: 0.5, y: 0.5 }), { x: WORLD.width / 2, y: WORLD.height / 2 });
  const corner = centreOf({ x: 0, y: 1 });
  // Fractions round-trip through floating point, so compare whole pixels.
  assert.equal(Math.round(corner.x), CARD.width / 2);
  assert.equal(Math.round(corner.y), WORLD.height - CARD.height / 2 - CARD_LEDGE);
  assert.deepEqual(cardRect({ x: 500, y: 400 }), { x: 500 - CARD.width / 2, y: 400 - CARD.height / 2, width: CARD.width, height: CARD.height + CARD_LEDGE });
});

test("a drag moves the card by the pointer movement divided by the zoom", () => {
  // 100 screen pixels at 50% zoom are 200 world pixels.
  assert.deepEqual(dragTo({ x: 800, y: 500 }, 100, -50, 0.5), { x: 1000 / WORLD.width, y: 400 / WORLD.height });
  assert.deepEqual(dragTo({ x: 800, y: 500 }, 100, 0, 1), { x: 900 / WORLD.width, y: 0.5 });
});

test("small pointer movements are clicks, larger ones are drags", () => {
  assert.equal(isDrag(3, 3), false);
  assert.equal(isDrag(4, 3), true);
  assert.equal(isDrag(0, -6), true);
});

test("arrow keys nudge, Shift nudges further, other keys do nothing", () => {
  const start = { x: 0.5, y: 0.5 };
  assert.deepEqual(nudge(start, "ArrowRight", false), { x: 0.52, y: 0.5 });
  assert.deepEqual(nudge(start, "ArrowUp", true), { x: 0.5, y: 0.42 });
  assert.equal(nudge(start, "Enter", false), null);
});

test("card status reflects the brain", () => {
  const brains = {
    qwen: { name: "Qwen (local)", description: "", location: "local", host: "this computer", status: "ready" },
    "claude-opus": { name: "Claude Opus 5.5", description: "", location: "cloud", host: "Anthropic", status: "needs_setup" },
  };
  const operator = { id: "operator", tools: ["csv_read"], brain: "qwen", available_brains: brains };
  assert.deepEqual(agentStatus(operator), { text: "Ready · Qwen (local)", warning: false });
  assert.deepEqual(agentStatus({ ...operator, brain: "claude-opus" }), { text: "Brain needs setup", warning: true });
  assert.deepEqual(agentStatus({ ...operator, brain: "removed" }), { text: "Ready · 1 tool", warning: false });
});

test("links follow each agent's saved link modes", () => {
  const operator = { id: "operator", links: { forecasting: "ask" } };
  const forecasting = { id: "forecasting", links: { operator: "none" } };
  const team = [operator, forecasting];
  assert.deepEqual(agentLinks(team, { operator: ["forecasting"] }), [{ from: "operator", to: "forecasting", state: "ask", label: "Asks after your OK", planned: false }]);
  assert.equal(agentLinks([{ ...operator, links: { forecasting: "auto" } }, forecasting], { operator: ["forecasting"] })[0].label, "Asks directly, without waiting for your OK");
  // Switched off, the connection stays on the map as a dashed one.
  assert.deepEqual(agentLinks([{ ...operator, links: { forecasting: "off" } }, forecasting], { operator: ["forecasting"] }), [{ from: "operator", to: "forecasting", state: "off", label: "Off: connected, but won’t ask", planned: true }]);
  // "none", unknown and self targets draw nothing.
  assert.deepEqual(agentLinks(team, { operator: ["ghost", "operator"], forecasting: ["operator"] }), []);
});

test("the map view is remembered per user", () => {
  assert.equal(viewStorageKey("rafa"), "mula.team.view.rafa");
});

test("cards closer than the gap overlap; exactly the gap apart do not", () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(overlaps(a, { x: 124, y: 0, width: 100, height: 100 }), false);
  assert.equal(overlaps(a, { x: 123, y: 0, width: 100, height: 100 }), true);
  assert.equal(overlaps(a, { x: 0, y: 124, width: 100, height: 100 }), false);
  // Side by side but far apart vertically is clear.
  assert.equal(overlaps(a, { x: 50, y: 300, width: 100, height: 100 }), false);
});

/** True when no two cards in the layout come closer than the gap. */
function allClear(layout) {
  const entries = Object.entries(layout);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (overlaps(cardRect(centreOf(entries[i][1])), cardRect(centreOf(entries[j][1])))) return false;
    }
  }
  return true;
}

test("a drop on another card moves to the nearest free spot; a clear drop stays put", () => {
  const layout = { operator: { x: 0.5, y: 0.5 } };
  const clear = { x: 0.2, y: 0.3 };
  assert.deepEqual(freeSpot("forecasting", clear, layout), clear);
  const moved = freeSpot("forecasting", { x: 0.52, y: 0.5 }, layout);
  assert.ok(allClear({ ...layout, forecasting: moved }));
  // Nearest: dropped just right of centre, it ends up just to the right, one card plus the gap away.
  const centre = centreOf(moved);
  assert.ok(centre.x > WORLD.width / 2, JSON.stringify(centre));
  assert.ok(Math.abs(centre.x - (WORLD.width / 2 + CARD.width + CARD_GAP)) <= 10, JSON.stringify(centre));
  // A card's own entry in the layout never blocks it.
  assert.deepEqual(freeSpot("operator", { x: 0.5, y: 0.5 }, layout), { x: 0.5, y: 0.5 });
});

test("a free spot keeps the whole card inside the world", () => {
  const layout = { operator: { x: 0, y: 0 } };
  const moved = freeSpot("forecasting", { x: 0, y: 0 }, layout);
  assert.deepEqual(clampPosition(moved), moved);
  assert.ok(allClear({ operator: clampPosition(layout.operator), forecasting: moved }));
});

test("with no room left, a card stays where it was dropped", () => {
  const crowded = {};
  for (let col = 0; col < 16; col++) {
    for (let row = 0; row < 10; row++) crowded[`a${col}-${row}`] = { x: col / 15, y: row / 9 };
  }
  assert.deepEqual(freeSpot("new", { x: 0.5, y: 0.5 }, crowded), { x: 0.5, y: 0.5 });
});

test("the starting layout never overlaps, keeps clear saved spots and is the same every time", () => {
  // The fallback diagonal for agents without a default used to overlap by construction.
  const ids = ["inventory", "procurement", "sales", "support", "marketing"];
  const settled = initialLayout(ids, {});
  assert.deepEqual(Object.keys(settled).sort(), [...ids].sort());
  assert.ok(allClear(settled));
  assert.deepEqual(initialLayout(ids, {}), settled);
  // A saved arrangement that is already clear is kept exactly; a newcomer makes room around it.
  const saved = { operator: { x: 0.3, y: 0.42 }, forecasting: { x: 0.7, y: 0.62 } };
  const withNew = initialLayout(["operator", "forecasting", "inventory"], { ...saved, inventory: undefined });
  assert.deepEqual(withNew.operator, saved.operator);
  assert.deepEqual(withNew.forecasting, saved.forecasting);
  assert.ok(allClear(withNew));
  // Saved cards win their spot over unsaved ones placed on top of them.
  const stacked = settleLayout(["operator", "forecasting"], { operator: { x: 0.5, y: 0.5 }, forecasting: { x: 0.5, y: 0.5 } });
  assert.deepEqual(stacked.operator, { x: 0.5, y: 0.5 });
  assert.ok(allClear(stacked));
});
