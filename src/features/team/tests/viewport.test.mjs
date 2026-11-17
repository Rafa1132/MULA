import assert from "node:assert/strict";
import test from "node:test";
import { MAX_ZOOM, MIN_ZOOM, boundsOf, clampView, clampZoom, fitView, keyAction, parseView, viewStorageKey, wheelZoomFactor, zoomAt } from "../services/viewport.ts";

test("zoom stays between 25% and 200%", () => {
  assert.equal(clampZoom(5), MAX_ZOOM);
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(Number.NaN), 1);
});

test("zooming keeps the point under the cursor in place", () => {
  const view = { x: 40, y: -20, zoom: 1 };
  const cursor = { x: 300, y: 200 };
  const worldBefore = { x: (cursor.x - view.x) / view.zoom, y: (cursor.y - view.y) / view.zoom };
  const next = zoomAt(view, 2, cursor);
  assert.equal(next.zoom, 2);
  assert.deepEqual({ x: (cursor.x - next.x) / next.zoom, y: (cursor.y - next.y) / next.zoom }, worldBefore);
  assert.equal(zoomAt(view, 10, cursor).zoom, MAX_ZOOM);
});

test("fit centres all cards within the zoom range", () => {
  const view = fitView({ x: 100, y: 100, width: 800, height: 400 }, { width: 1000, height: 600 });
  assert.equal(view.zoom, (1000 - 96) / 800);
  // The content's centre lands on the viewport's centre.
  assert.ok(Math.abs(500 * view.zoom + view.x - 500) < 1e-9);
  assert.ok(Math.abs(300 * view.zoom + view.y - 300) < 1e-9);
  // A tiny phone viewport still can't zoom out past 25%.
  assert.equal(fitView({ x: 0, y: 0, width: 4000, height: 4000 }, { width: 320, height: 400 }).zoom, MIN_ZOOM);
});

test("panning can't lose the world off screen", () => {
  const viewport = { width: 1000, height: 600 };
  const world = { width: 1600, height: 1000 };
  assert.deepEqual(clampView({ x: 5000, y: -9000, zoom: 1 }, viewport, world), { x: 880, y: 120 - 1000, zoom: 1 });
  assert.deepEqual(clampView({ x: 10, y: 10, zoom: 1 }, viewport, world), { x: 10, y: 10, zoom: 1 });
});

test("keys: + and - zoom, 0 resets, F fits, arrows pan only when the map itself has focus", () => {
  assert.deepEqual(keyAction("+", false), { type: "zoom-in" });
  assert.deepEqual(keyAction("=", true), { type: "zoom-in" });
  assert.deepEqual(keyAction("-", true), { type: "zoom-out" });
  assert.deepEqual(keyAction("0", true), { type: "reset" });
  assert.deepEqual(keyAction("F", true), { type: "fit" });
  assert.deepEqual(keyAction("ArrowRight", true), { type: "pan", dx: -60, dy: 0 });
  assert.equal(keyAction("ArrowRight", false), null);
  assert.equal(keyAction("Enter", true), null);
});

test("one wheel step zooms gently, in either direction", () => {
  assert.ok(wheelZoomFactor(-100) > 1);
  assert.ok(wheelZoomFactor(100) < 1);
  assert.equal(wheelZoomFactor(100), wheelZoomFactor(400));
});

test("bounds wrap every card", () => {
  assert.equal(boundsOf([]), null);
  assert.deepEqual(boundsOf([{ x: 10, y: 20, width: 100, height: 50 }, { x: 300, y: 0, width: 100, height: 50 }]), { x: 10, y: 0, width: 390, height: 70 });
});

test("a saved view is read back only when well-formed", () => {
  assert.equal(viewStorageKey("rafa"), "mula.team.view.rafa");
  assert.deepEqual(parseView('{"x":10,"y":-5,"zoom":0.8}'), { x: 10, y: -5, zoom: 0.8 });
  assert.deepEqual(parseView('{"x":0,"y":0,"zoom":9}'), { x: 0, y: 0, zoom: MAX_ZOOM });
  assert.equal(parseView(null), null);
  assert.equal(parseView("not json"), null);
  assert.equal(parseView('{"x":"1","y":0,"zoom":1}'), null);
});
