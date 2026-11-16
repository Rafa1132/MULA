import assert from "node:assert/strict";
import test from "node:test";
import { CATALOGUE_ENTRIES } from "../data.ts";
import { findEntry } from "../services/details.ts";
import { alsoRemovesLabel, includesHint, parentOf, pluginsOf, searchCatalogue } from "../services/plugins.ts";

const shown = (matches) => matches.map((match) => match.entry.name);

test("plugins are derived from parentId, and only plugins have a parent", () => {
  assert.deepEqual(pluginsOf("tokopedia-sync").map((entry) => entry.id), ["store-monitor", "store-admin"]);
  assert.equal(parentOf(findEntry("store-admin")).id, "tokopedia-sync");
  assert.equal(parentOf(findEntry("tokopedia-sync")), undefined);
  assert.equal(parentOf(findEntry("operator")), undefined);
});

test("the grid never shows plugins, with or without a search", () => {
  const all = searchCatalogue(CATALOGUE_ENTRIES, "");
  assert.equal(all.length, CATALOGUE_ENTRIES.length - 2);
  assert.ok(all.every((match) => match.entry.kind !== "plugin" && match.matchedPlugins.length === 0));
});

test("a search that matches a plugin shows its parent with the plugin named", () => {
  const matches = searchCatalogue(CATALOGUE_ENTRIES, "ALERTS");
  assert.deepEqual(shown(matches), ["Store app"]);
  assert.deepEqual(matches[0].matchedPlugins.map((plugin) => plugin.name), ["Store monitor"]);
  assert.equal(includesHint(matches[0].matchedPlugins), "Includes Store monitor");
  // Both plugins match "plugin"; the parent appears once.
  const both = searchCatalogue(CATALOGUE_ENTRIES, "plugin");
  assert.deepEqual(shown(both), ["Store app"]);
  assert.equal(includesHint(both[0].matchedPlugins), "Includes Store monitor and Store admin");
});

test("a parent that matches by itself gets no hint unless a plugin matches too", () => {
  const matches = searchCatalogue(CATALOGUE_ENTRIES, "sync");
  assert.deepEqual(shown(matches), ["Store app"]);
  assert.deepEqual(matches[0].matchedPlugins, []);
  assert.equal(includesHint([]), "");
});

test("hints and removal wording read naturally", () => {
  const plugin = (name) => ({ name });
  assert.equal(includesHint([plugin("A"), plugin("B"), plugin("C")]), "Includes A, B and C");
  assert.equal(alsoRemovesLabel(0), "");
  assert.equal(alsoRemovesLabel(1), "This also removes 1 plugin.");
  assert.equal(alsoRemovesLabel(2), "This also removes 2 plugins.");
});
