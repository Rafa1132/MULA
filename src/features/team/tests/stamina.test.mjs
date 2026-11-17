import assert from "node:assert/strict";
import test from "node:test";
import { STAMINA_SEGMENTS, UNLIMITED, formatTokens, staminaOf, staminaView } from "../services/stamina.ts";

test("missing or malformed stamina counts as unlimited", () => {
  assert.deepEqual(staminaOf(undefined), UNLIMITED);
  assert.deepEqual(staminaOf({ used: -1, limit: 10 }), UNLIMITED);
  assert.deepEqual(staminaOf({ used: 5, limit: 0 }), UNLIMITED);
  assert.deepEqual(staminaOf({ used: "5", limit: 10 }), UNLIMITED);
  assert.deepEqual(staminaOf({ used: 120, limit: null }), { used: 120, limit: null });
  assert.deepEqual(staminaOf({ used: 120, limit: 500 }), { used: 120, limit: 500 });
});

test("unlimited shows a full bar labelled Unlimited", () => {
  const view = staminaView(UNLIMITED);
  assert.equal(view.filled, STAMINA_SEGMENTS);
  assert.equal(view.label, "Unlimited");
  assert.equal(view.spoken, "Stamina: unlimited");
  assert.equal(view.low, false);
});

test("a limit fills the share left and labels it", () => {
  const view = staminaView({ used: 38_000, limit: 50_000 });
  assert.equal(view.label, "12k / 50k left");
  assert.equal(view.filled, 3);
  assert.equal(view.low, false);
  assert.equal(view.spoken, "Stamina: 12k of 50k tokens left");
  assert.equal(view.left, 12_000);
});

test("below 20% left the bar says Low", () => {
  const view = staminaView({ used: 45_000, limit: 50_000 });
  assert.equal(view.low, true);
  assert.equal(view.filled, 1);
  assert.equal(view.valueText, "5k of 50k tokens left, low");
  // Exactly 20% is not low yet; overspending shows an empty bar, not a negative one.
  assert.equal(staminaView({ used: 40_000, limit: 50_000 }).low, false);
  assert.equal(staminaView({ used: 60_000, limit: 50_000 }).filled, 0);
  assert.equal(staminaView({ used: 60_000, limit: 50_000 }).label, "0 / 50k left");
});

test("token counts are short", () => {
  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(1500), "1.5k");
  assert.equal(formatTokens(12_400), "12k");
  assert.equal(formatTokens(2_000_000), "2M");
});
