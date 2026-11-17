import assert from "node:assert/strict";
import test from "node:test";
import { CARD, CARD_LEDGE, DEFAULT_POSITIONS, WORLD, agentLinks, agentStatus, cardRect, centreOf, clampFraction, clampToCanvas, dragTo, isDrag, nudge, positionFor } from "../services/map.ts";

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

test("links follow the store's connections; only runtime-supported ones are active", () => {
  const operator = { id: "operator", delegates_to: ["forecasting"], delegation: "ask" };
  const forecasting = { id: "forecasting", delegates_to: [], delegation: null };
  const inventory = { id: "inventory", delegates_to: [], delegation: null };
  const team = [operator, forecasting, inventory];
  assert.deepEqual(agentLinks(team, { operator: ["forecasting"] }), [{ from: "operator", to: "forecasting", state: "ask", label: "Asks after your OK", planned: false }]);
  assert.equal(agentLinks([{ ...operator, delegation: "auto" }, forecasting], { operator: ["forecasting"] })[0].label, "Asks directly, without waiting for your OK");
  // Switched off, the connection stays on the map as a dashed one.
  assert.deepEqual(agentLinks([{ ...operator, delegation: "off" }, forecasting], { operator: ["forecasting"] }), [{ from: "operator", to: "forecasting", state: "off", label: "Off: set to Don’t ask other agents", planned: true }]);
  // Connections added in the panel that the runtime can't use yet are planned.
  assert.deepEqual(agentLinks(team, { operator: ["inventory"], forecasting: ["inventory"] }).map((link) => [link.from, link.to, link.state]), [["operator", "inventory", "planned"], ["forecasting", "inventory", "planned"]]);
  // Removed connections draw nothing; unknown and self targets are ignored.
  assert.deepEqual(agentLinks(team, { operator: [], forecasting: ["forecasting", "ghost"] }), []);
});
