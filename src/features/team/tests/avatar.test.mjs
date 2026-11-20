import assert from "node:assert/strict";
import test from "node:test";
import { characterFor } from "../services/avatar.ts";

test("the orchestrator is the orb, and other agents are bubble bots", () => {
  assert.deepEqual(characterFor("operator", "Operator"), { kind: "orb" });
  assert.deepEqual(characterFor("forecasting", "Forecasting"), { kind: "bot", src: "/agents/finance.svg" });
  for (const bot of ["finance", "sales", "inventory", "support"]) assert.deepEqual(characterFor(bot, bot), { kind: "bot", src: `/agents/${bot}.svg` });
});

test("an agent without its own bot yet shows its initial, never another agent's art or the orb", () => {
  assert.deepEqual(characterFor("procurement", "procurement"), { kind: "initial", letter: "P" });
  assert.deepEqual(characterFor("x", "  "), { kind: "initial", letter: "?" });
  assert.deepEqual(characterFor("__proto__", "Odd"), { kind: "initial", letter: "O" });
});
