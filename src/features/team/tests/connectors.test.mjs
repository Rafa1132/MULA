import assert from "node:assert/strict";
import test from "node:test";
import { CONNECTOR_GAP, facingAxis, isClear, pointOn, routeConnector } from "../services/connectors.ts";

const card = (x, y) => ({ x, y, width: 200, height: 240 });
const CURVES_ONLY = /^M-?[\d.]+ -?[\d.]+( C(-?[\d.]+ -?[\d.]+ ?){3})+$/;

test("lines join the edges that face each other across the wider gap", () => {
  assert.equal(facingAxis(card(0, 0), card(500, 100)), "horizontal");
  assert.equal(facingAxis(card(0, 0), card(100, 600)), "vertical");
});

test("a line is one smooth curve between the middles of the facing edges, a gap from the borders", () => {
  const route = routeConnector(card(0, 0), card(500, 100), []);
  assert.equal(route.cubics.length, 1);
  const [start, c1, c2, end] = route.cubics[0];
  assert.deepEqual(start, { x: 200 + CONNECTOR_GAP, y: 120 });
  assert.deepEqual(end, { x: 500 - CONNECTOR_GAP, y: 220 });
  // Handles run straight out of each edge, so the curve leaves and enters level.
  assert.equal(c1.y, start.y);
  assert.equal(c2.y, end.y);
  assert.ok(c1.x > start.x && c2.x < end.x);
  // Only cubic segments: no straight runs, no corners.
  assert.match(route.d, CURVES_ONLY);
});

test("right-to-left and vertical links mirror the same rules", () => {
  const leftwards = routeConnector(card(500, 0), card(0, 0), []).cubics[0];
  assert.deepEqual(leftwards[0], { x: 500 - CONNECTOR_GAP, y: 120 });
  assert.ok(leftwards[1].x < leftwards[0].x);
  const down = routeConnector(card(0, 0), card(0, 600), []).cubics[0];
  assert.deepEqual(down[0], { x: 100, y: 240 + CONNECTOR_GAP });
  assert.deepEqual(down[3], { x: 100, y: 600 - CONNECTOR_GAP });
  assert.equal(down[1].x, 100);
  assert.ok(down[1].y > down[0].y);
});

test("close cards still get level ends; cards that touch or overlap get no line", () => {
  // 36px between the line ends, yet each handle is still at least 40px long.
  const close = routeConnector(card(0, 0), card(260, 100), []);
  const [start, c1] = close.cubics[0];
  assert.ok(c1.x - start.x >= 40);
  assert.equal(routeConnector(card(0, 0), card(210, 0), []), null);
  assert.equal(routeConnector(card(0, 0), card(50, 50), []), null);
});

test("lines curve around a card in the way, joining smoothly at the waypoint", () => {
  const from = card(0, 300);
  const to = card(1000, 300);
  const blocker = card(500, 300);
  const direct = routeConnector(from, to, []);
  assert.equal(isClear(direct.samples, from, to, [blocker]), false);
  const route = routeConnector(from, to, [blocker]);
  assert.ok(isClear(route.samples, from, to, [blocker]));
  assert.equal(route.cubics.length, 2);
  // The tangent is level on both sides of the join, so there is no corner.
  const [first, second] = route.cubics;
  assert.deepEqual(first[3], second[0]);
  assert.equal(first[2].y, first[3].y);
  assert.equal(second[1].y, second[0].y);
  assert.match(route.d, CURVES_ONLY);
});

test("the arrowhead follows the curve's final direction", () => {
  const route = routeConnector(card(0, 0), card(600, 0), []);
  // Level arrival from the left: both arms sit 8px back from the tip, 5px above and below.
  assert.equal(route.arrow, "M580 125 L588 120 L580 115");
  const down = routeConnector(card(0, 0), card(0, 600), []);
  assert.equal(down.arrow, "M95 580 L100 588 L105 580");
});

test("the tooltip sits halfway along the curve", () => {
  const route = routeConnector(card(0, 0), card(600, 0), []);
  assert.ok(Math.abs(route.mid.x - 400) < 12);
  assert.equal(route.mid.y, 120);
  assert.deepEqual(pointOn(route.cubics[0], 0), route.cubics[0][0]);
});

test("regression: a map card centred between two others is cleared, not crossed", () => {
  // Real card boxes (232 × 262) at 20%, 50% and 80% across the world: an arc just above the middle card
  // would still be climbing at its corner, so the waypoint has to sit higher.
  const box = (x) => ({ x: x - 116, y: 372, width: 232, height: 262 });
  const [from, blocker, to] = [box(320), box(800), box(1280)];
  const route = routeConnector(from, to, [blocker]);
  assert.ok(isClear(route.samples, from, to, [blocker]));
  assert.equal(route.cubics.length, 2);
});
