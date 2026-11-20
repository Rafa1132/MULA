import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COLORS,
  ORB_STATES,
  STATE_PARAMS,
  TRANSITION_MS,
  blobPosition,
  easeParams,
  easeToward,
  fakeLevel,
  mixColor,
  orbScale,
  paletteFromColor,
  parseColor,
  resolveColors,
  rgba,
  rmsLevel,
  smoothLevel,
} from "../services/orb.ts";

test("colours are read from hex and rgb(), and anything else is refused", () => {
  assert.deepEqual(parseColor("#9FE8C8"), { r: 159, g: 232, b: 200 });
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor(" rgb(10, 20, 30) "), { r: 10, g: 20, b: 30 });
  assert.deepEqual(parseColor("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30 });
  assert.deepEqual(parseColor("rgb(300 20 30)"), { r: 255, g: 20, b: 30 });
  for (const bad of ["", "mint", "#12345", "#ggg", "hsl(10, 20%, 30%)", "url(x)"]) {
    assert.equal(parseColor(bad), null, bad);
  }
});

test("an unreadable or missing colour falls back to the default in its slot", () => {
  const [first, second, third] = resolveColors(["nope", "#000000"]);
  assert.deepEqual(first, parseColor(DEFAULT_COLORS[0]));
  assert.deepEqual(second, { r: 0, g: 0, b: 0 });
  assert.deepEqual(third, parseColor(DEFAULT_COLORS[2]));
});

test("mixing and rgba() stay in range", () => {
  assert.deepEqual(mixColor({ r: 0, g: 0, b: 0 }, { r: 200, g: 100, b: 50 }, 0.5), { r: 100, g: 50, b: 25 });
  assert.deepEqual(mixColor({ r: 0, g: 0, b: 0 }, { r: 200, g: 100, b: 50 }, 7), { r: 200, g: 100, b: 50 });
  assert.equal(rgba({ r: 1.4, g: 2.6, b: 3 }, 2), "rgba(1, 3, 3, 1.000)");
});

test("one tint becomes a three-colour palette for an agent's orb", () => {
  const palette = paletteFromColor("#f26b1d");
  assert.equal(palette.length, 3);
  assert.equal(palette[0], "#f26b1d");
  assert.equal(palette[1], "#ffffff");
  assert.match(palette[2], /^#[0-9a-f]{6}$/);
  assert.notEqual(palette[2], palette[0]);
  assert.deepEqual(paletteFromColor("not a colour"), [...DEFAULT_COLORS]);
});

test("a state change eases over about 300 ms and never overshoots or snaps", () => {
  assert.equal(easeToward(0, 1, 0), 0);
  assert.equal(easeToward(0, 1, -5), 0);
  const oneFrame = easeToward(0, 1, 16);
  assert.ok(oneFrame > 0 && oneFrame < 0.2, `one frame moves a little: ${oneFrame}`);
  // 300 ms in 60 fps frames gets about 95 percent of the way, the same as one 300 ms step.
  let value = 0;
  for (let frame = 0; frame < 18; frame += 1) value = easeToward(value, 1, 300 / 18);
  assert.ok(Math.abs(value - easeToward(0, 1, 3 * TRANSITION_MS)) < 1e-9);
  assert.ok(value > 0.94 && value < 1, `after 300 ms: ${value}`);
  assert.ok(easeToward(0, 1, 10_000) <= 1);
  const eased = easeParams(STATE_PARAMS.idle, STATE_PARAMS.thinking, 300);
  assert.ok(eased.speed > STATE_PARAMS.idle.speed && eased.speed < STATE_PARAMS.thinking.speed);
});

test("the level is smoothed and kept between 0 and 1", () => {
  const step = smoothLevel(0, 1, 16);
  assert.ok(step > 0 && step < 0.3, `a spike only nudges it: ${step}`);
  assert.equal(smoothLevel(0.5, 0.5, 16), 0.5);
  assert.equal(smoothLevel(0, 5, 10_000), 1);
  assert.equal(smoothLevel(0, Number.NaN, 16), 0);
});

test("analyser frames become a loudness from 0 to 1", () => {
  assert.equal(rmsLevel([]), 0);
  assert.equal(rmsLevel(new Uint8Array(128).fill(128)), 0);
  const loud = new Uint8Array(128).map((_, index) => (index % 2 ? 255 : 0));
  assert.equal(rmsLevel(loud), 1);
  const quiet = new Uint8Array(128).map((_, index) => (index % 2 ? 136 : 120));
  assert.ok(rmsLevel(quiet) > 0 && rmsLevel(quiet) < 0.5);
});

test("the fake wave moves and stays in range", () => {
  const values = Array.from({ length: 400 }, (_, index) => fakeLevel(index / 20));
  assert.ok(values.every((value) => value >= 0 && value <= 1));
  assert.ok(Math.max(...values) - Math.min(...values) > 0.3);
});

test("each state's size follows the brief", () => {
  assert.deepEqual([...ORB_STATES], ["idle", "listening", "thinking", "speaking"]);
  const idle = Array.from({ length: 100 }, (_, index) => orbScale(STATE_PARAMS.idle, 1, index / 10));
  assert.ok(Math.min(...idle) >= 1 && Math.max(...idle) <= 1.02 + 1e-9, "idle breathes about 2 percent and ignores audio");
  assert.ok(Math.max(...idle) > 1.019);
  for (const level of [0, 0.5, 1]) assert.equal(orbScale(STATE_PARAMS.thinking, level, 3.3), 1, "thinking never scales");
  assert.ok(orbScale(STATE_PARAMS.speaking, 1, 0) > orbScale(STATE_PARAMS.speaking, 0.2, 0), "speaking grows with the level");
  assert.ok(orbScale(STATE_PARAMS.listening, 1, 0) > 1);
  assert.ok(orbScale(STATE_PARAMS.speaking, 1, 0) < 1.2, "it stays inside its canvas");
  assert.ok(STATE_PARAMS.listening.brightness > STATE_PARAMS.idle.brightness);
  assert.ok(STATE_PARAMS.thinking.speed > STATE_PARAMS.speaking.speed && STATE_PARAMS.speaking.speed > STATE_PARAMS.idle.speed);
});

test("blobs stay within their orbit and don't move in step", () => {
  for (let index = 0; index < 3; index += 1) {
    for (let phase = 0; phase < 20; phase += 0.37) {
      const { x, y } = blobPosition(index, phase, 0.4);
      assert.ok(Math.abs(x) <= 0.4 + 1e-9 && Math.abs(y) <= 0.4 + 1e-9);
    }
  }
  assert.notDeepEqual(blobPosition(0, 1, 0.4), blobPosition(1, 1, 0.4));
});
