import assert from "node:assert/strict";
import test from "node:test";
import { CATALOGUE_ENTRIES } from "../data.ts";
import { filterEntries, resultCount } from "../services/search.ts";

function names(entries) {
  return entries.map((entry) => entry.name);
}

test("a blank search shows every entry in its original order", () => {
  assert.deepEqual(filterEntries(CATALOGUE_ENTRIES, ""), CATALOGUE_ENTRIES);
  assert.deepEqual(filterEntries(CATALOGUE_ENTRIES, "   "), CATALOGUE_ENTRIES);
});

test("search matches name, description and tags, ignoring case", () => {
  assert.deepEqual(names(filterEntries(CATALOGUE_ENTRIES, "OPERATOR")), ["Operator"]);
  assert.deepEqual(names(filterEntries(CATALOGUE_ENTRIES, "unpaid")), ["Invoice maker"]);
  assert.deepEqual(names(filterEntries(CATALOGUE_ENTRIES, "courier")), ["Delivery tracker"]);
});

test("every word must match, but words may match different fields", () => {
  assert.deepEqual(names(filterEntries(CATALOGUE_ENTRIES, "tokopedia sync")), ["Tokopedia store sync"]);
  assert.deepEqual(names(filterEntries(CATALOGUE_ENTRIES, "forecast unpaid")), []);
});

test("the mock data is complete and consistent", () => {
  const ids = new Set();
  for (const entry of CATALOGUE_ENTRIES) {
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.image.startsWith("/catalogue/") && entry.image.endsWith(".png"), entry.id);
    assert.ok(entry.imageAlt.trim().length > 0, `${entry.id} needs alt text`);
    assert.ok(entry.tags.length > 0, `${entry.id} needs tags`);
  }
  const agents = names(CATALOGUE_ENTRIES.filter((entry) => entry.type === "agent"));
  assert.deepEqual(agents, ["Operator", "Forecasting", "Store"]);
  assert.equal(CATALOGUE_ENTRIES.find((entry) => entry.id === "store").status, "coming_soon");
});

test("the result count reads naturally", () => {
  assert.equal(resultCount(0), "0 results");
  assert.equal(resultCount(1), "1 result");
  assert.equal(resultCount(7), "7 results");
});
