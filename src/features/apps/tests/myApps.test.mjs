import assert from "node:assert/strict";
import test from "node:test";
import { appCount, appsFromIds, attentionCount, filterApps, lastSyncedLabel, sortApps, usedByLabel } from "../services/myApps.ts";

const names = (apps) => apps.map((app) => app.name);

test("only app entries become My apps", () => {
  assert.deepEqual(names(appsFromIds(["operator", "stock-sheet", "missing"])), ["Stock sheet"]);
});

test("added plugins sit inside their parent instead of being apps of their own", () => {
  const apps = appsFromIds(["tokopedia-sync", "store-admin", "stock-sheet"]);
  assert.deepEqual(names(apps), ["Store app", "Stock sheet"]);
  assert.deepEqual(apps[0].plugins.map((plugin) => plugin.name), ["Store admin"]);
  assert.deepEqual(apps[1].plugins, []);
});

test("needs attention comes first, then not connected, then connected, by name", () => {
  const apps = appsFromIds(["shop-website", "stock-sheet", "invoice-maker", "tokopedia-sync"]);
  assert.deepEqual(names(sortApps(apps)), ["Store app", "Invoice maker", "Shop website", "Stock sheet"]);
  assert.equal(attentionCount(apps), 1);
});

test("search looks at name and description only, ignoring case", () => {
  const apps = appsFromIds(["shop-website", "stock-sheet", "tokopedia-sync"]);
  assert.deepEqual(names(filterApps(apps, "STOREFRONT")), ["Shop website"]);
  assert.deepEqual(names(filterApps(apps, "tokopedia stock")), ["Store app"]);
  // "ecommerce" is only a tag, so it does not match here.
  assert.deepEqual(names(filterApps(apps, "ecommerce")), []);
  assert.equal(filterApps(apps, "  ").length, 3);
});

test("last synced reads naturally", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(lastSyncedLabel(null, now), "Never");
  assert.equal(lastSyncedLabel("2026-11-16T11:59:40Z", now), "Just now");
  assert.equal(lastSyncedLabel("2026-11-16T11:48:00Z", now), "12 minutes ago");
  assert.equal(lastSyncedLabel("2026-11-16T11:00:00Z", now), "1 hour ago");
  assert.equal(lastSyncedLabel("2026-11-14T12:00:00Z", now), "2 days ago");
  assert.equal(lastSyncedLabel("not a date", now), "Unknown");
});

test("used by names the agents, or says none", () => {
  assert.equal(usedByLabel(["operator", "store"]), "Operator, Store");
  assert.equal(usedByLabel([]), "No agents yet");
  assert.equal(usedByLabel(["stock-sheet"]), "No agents yet");
  assert.equal(appCount(1), "1 app");
  assert.equal(appCount(3), "3 apps");
});
