import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_POSITIONS, agentLinks, agentStatus, lineBetween, clampFraction, clampToCanvas, isDrag, nudge, pointerToFraction, positionFor } from "../services/map.ts";

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

test("the grabbed point stays under the pointer", () => {
  const canvas = { left: 100, top: 50, width: 800, height: 400 };
  assert.deepEqual(pointerToFraction(canvas, 520, 270, { x: 20, y: 20 }), { x: 0.5, y: 0.5 });
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
    qwen: { name: "Qwen (local)", description: "", location: "local", status: "ready" },
    "claude-opus": { name: "Claude Opus 5.5", description: "", location: "cloud", status: "needs_setup" },
  };
  const operator = { id: "operator", tools: ["csv_read"], brain: "qwen", available_brains: brains };
  assert.deepEqual(agentStatus(operator), { text: "Ready · Qwen (local)", warning: false });
  assert.deepEqual(agentStatus({ ...operator, brain: "claude-opus" }), { text: "Brain needs setup", warning: true });
  assert.deepEqual(agentStatus({ ...operator, brain: "removed" }), { text: "Ready · 1 tool", warning: false });
});

test("links follow the delegation setting", () => {
  const operator = { id: "operator", delegates_to: ["forecasting", "inventory"], delegation: "ask" };
  const forecasting = { id: "forecasting", delegates_to: [], delegation: null };
  assert.deepEqual(agentLinks([operator, forecasting]), [{ from: "operator", to: "forecasting", mode: "ask", label: "asks after your OK" }]);
  assert.equal(agentLinks([{ ...operator, delegation: "auto" }, forecasting])[0].label, "asks directly");
  assert.deepEqual(agentLinks([{ ...operator, delegation: "off" }, forecasting]), []);
});

test("lines stop just outside both cards", () => {
  const card = { width: 200, height: 100 };
  assert.deepEqual(lineBetween({ x: 0, y: 0 }, { x: 500, y: 0 }, card, 10), { x1: 110, y1: 0, x2: 390, y2: 0 });
  assert.deepEqual(lineBetween({ x: 0, y: 0 }, { x: 0, y: 300 }, card, 10), { x1: 0, y1: 60, x2: 0, y2: 240 });
  // Cards that touch or overlap get no line rather than one pointing backwards.
  assert.equal(lineBetween({ x: 0, y: 0 }, { x: 210, y: 0 }, card, 10), null);
  assert.equal(lineBetween({ x: 5, y: 5 }, { x: 5, y: 5 }, card), null);
});
