import assert from "node:assert/strict";
import test from "node:test";
import { entranceFor, entranceMs, mayFocusInput, takeEntranceSeen } from "../services/entry.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

const blocked = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("SecurityError"); },
};

test("the entrance is full on the first visit, short on a reload, and absent under reduced motion", () => {
  assert.equal(entranceFor(false, false), "full");
  assert.equal(entranceFor(false, true), "short");
  assert.equal(entranceFor(true, false), "none");
  assert.equal(entranceFor(true, true), "none");
  assert.equal(entranceMs("full"), 2700);
  assert.equal(entranceMs("short"), 500);
  assert.equal(entranceMs("none"), 0);
});

test("focus moves into the input on its own only with a fine pointer", () => {
  assert.equal(mayFocusInput(false), true);
  assert.equal(mayFocusInput(true), false);
});

test("the full entrance is recorded the first time it is read", () => {
  const storage = memoryStorage();
  assert.equal(takeEntranceSeen(storage), false);
  assert.equal(takeEntranceSeen(storage), true);
  assert.equal(takeEntranceSeen(null), false);
  assert.equal(takeEntranceSeen(blocked), false);
});
