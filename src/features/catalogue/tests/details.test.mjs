import assert from "node:assert/strict";
import test from "node:test";
import { CATALOGUE_ENTRIES } from "../data.ts";
import { findEntry, formatPrice, wrapIndex } from "../services/details.ts";
import { pluginsOf } from "../services/plugins.ts";

test("price shows Free for zero and a formatted amount otherwise", () => {
  assert.equal(formatPrice({ amount: 0, currency: "IDR" }), "Free");
  assert.match(formatPrice({ amount: 49000, currency: "IDR" }), /^Rp\s?49\.000$/);
  console.warn = () => {};
  assert.equal(formatPrice({ amount: 5, currency: "NOT-A-CODE" }), "5 NOT-A-CODE");
});

test("the carousel wraps at both ends", () => {
  assert.equal(wrapIndex(0, -1, 4), 3);
  assert.equal(wrapIndex(3, 1, 4), 0);
  assert.equal(wrapIndex(1, 1, 4), 2);
  assert.equal(wrapIndex(0, 1, 0), 0);
});

test("every entry has complete detail data", () => {
  const parentIds = new Set(CATALOGUE_ENTRIES.filter((entry) => entry.type === "app" && entry.kind === "app").map((entry) => entry.id));
  for (const entry of CATALOGUE_ENTRIES) {
    assert.ok(entry.screenshots.length >= 3 && entry.screenshots.length <= 4, `${entry.id} needs 3–4 previews`);
    for (const shot of entry.screenshots) {
      assert.ok(shot.src.startsWith(`/catalogue/${entry.id}/`) && shot.src.endsWith(".png"), shot.src);
      assert.ok(shot.alt.trim().length > entry.name.length + 2, `${shot.src} needs meaningful alt text`);
    }
    assert.ok(entry.longDescription.length > entry.description.length, `${entry.id} needs a longer description`);
    assert.ok(Number.isFinite(entry.price.amount) && entry.price.amount >= 0, entry.id);
    assert.match(entry.price.currency, /^[A-Z]{3}$/);
    // Apps say whether they are a plugin; only plugins name a parent, and it must be a real app.
    if (entry.type === "agent") assert.equal(entry.kind, undefined, entry.id);
    if (entry.type === "app") assert.ok(entry.kind === "app" || entry.kind === "plugin", `${entry.id} needs a kind`);
    if (entry.kind === "plugin") assert.ok(parentIds.has(entry.parentId), `${entry.id} needs a parent app`);
    if (entry.kind !== "plugin") assert.equal(entry.parentId, undefined, `${entry.id} is not a plugin`);
  }
});

test("the To-do app and the Store app with its plugins are in the data", () => {
  const todo = findEntry("todo");
  assert.equal(todo.type, "app");
  assert.equal(todo.description, "A simple task list for daily shop chores.");
  assert.equal(formatPrice(todo.price), "Free");
  assert.deepEqual(pluginsOf("todo"), []);
  assert.equal(findEntry("tokopedia-sync").name, "Store app");
  assert.deepEqual(pluginsOf("tokopedia-sync").map((entry) => entry.name), ["Store monitor", "Store admin"]);
  for (const id of ["tokopedia-sync", "store-monitor", "store-admin"]) assert.equal(formatPrice(findEntry(id).price), "Free");
});
