import assert from "node:assert/strict";
import test from "node:test";

const KEY = "mula.prototype.added-apps";
const warnings = [];
console.warn = (...args) => warnings.push(args[0]);

/** A fake browser window whose storage can be made to fail. */
function installWindow({ throwOnAccess = false, throwOnWrite = false, initial } = {}) {
  const values = new Map();
  if (initial !== undefined) values.set(KEY, initial);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (throwOnWrite) throw new Error("quota"); values.set(key, value); },
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    get localStorage() { if (throwOnAccess) throw new Error("blocked"); return storage; },
  };
  return values;
}

const store = await import("../services/addedApps.ts");

test("adding and removing apps is saved to browser storage", () => {
  const values = installWindow();
  store.reloadAddedApps();
  assert.equal(store.addApp("tokopedia-sync"), true);
  assert.equal(store.addApp("stock-sheet"), true);
  store.addApp("tokopedia-sync");
  assert.deepEqual(store.getAddedAppIds(), ["tokopedia-sync", "stock-sheet"]);
  assert.equal(values.get(KEY), JSON.stringify(["tokopedia-sync", "stock-sheet"]));
  store.removeApp("tokopedia-sync");
  assert.deepEqual(store.getAddedAppIds(), ["stock-sheet"]);
  assert.equal(values.get(KEY), JSON.stringify(["stock-sheet"]));
});

test("agents, unknown ids and coming-soon apps are refused", () => {
  installWindow();
  store.reloadAddedApps();
  assert.equal(store.addApp("operator"), false);
  assert.equal(store.addApp("nonexistent"), false);
  assert.equal(store.addApp("delivery-tracker"), false);
  assert.deepEqual(store.getAddedAppIds(), []);
});

test("a plugin needs its parent added first, and adding the parent adds no plugins", () => {
  installWindow();
  store.reloadAddedApps();
  assert.equal(store.addApp("store-monitor"), false);
  assert.deepEqual(store.getAddedAppIds(), []);
  assert.equal(store.addApp("tokopedia-sync"), true);
  assert.deepEqual(store.getAddedAppIds(), ["tokopedia-sync"]);
  assert.equal(store.addApp("store-monitor"), true);
  assert.equal(store.addApp("store-admin"), true);
  assert.deepEqual(store.getAddedAppIds(), ["tokopedia-sync", "store-monitor", "store-admin"]);
});

test("removing a parent removes its plugins; removing a plugin keeps the parent", () => {
  installWindow();
  store.reloadAddedApps();
  for (const id of ["tokopedia-sync", "stock-sheet", "store-monitor", "store-admin"]) store.addApp(id);
  store.removeApp("store-admin");
  assert.deepEqual(store.getAddedAppIds(), ["tokopedia-sync", "stock-sheet", "store-monitor"]);
  store.removeApp("tokopedia-sync");
  assert.deepEqual(store.getAddedAppIds(), ["stock-sheet"]);
});

test("a saved plugin without its parent is dropped on load", () => {
  installWindow({ initial: JSON.stringify(["store-monitor", "stock-sheet"]) });
  store.reloadAddedApps();
  assert.deepEqual(store.getAddedAppIds(), ["stock-sheet"]);
  // Saved before its parent still counts, since the parent is in the list.
  installWindow({ initial: JSON.stringify(["store-admin", "tokopedia-sync"]) });
  store.reloadAddedApps();
  assert.deepEqual(store.getAddedAppIds(), ["tokopedia-sync", "store-admin"]);
});

test("a saved list is read back and cleaned", () => {
  installWindow({ initial: JSON.stringify(["stock-sheet", "operator", "stock-sheet", 42, "invoice-maker"]) });
  store.reloadAddedApps();
  assert.deepEqual(store.getAddedAppIds(), ["stock-sheet", "invoice-maker"]);
});

test("corrupt saved data starts empty and says why", () => {
  warnings.length = 0;
  installWindow({ initial: "{not json" });
  store.reloadAddedApps();
  assert.deepEqual(store.getAddedAppIds(), []);
  assert.match(warnings[0], /could not read the added apps/);
});

test("blocked storage keeps working for the visit", () => {
  warnings.length = 0;
  installWindow({ throwOnAccess: true });
  store.reloadAddedApps();
  assert.equal(store.addApp("invoice-maker"), true);
  assert.deepEqual(store.getAddedAppIds(), ["invoice-maker"]);
  assert.ok(warnings.some((warning) => /could not open browser storage/.test(warning)));
});

test("a failed save keeps the change for the visit and says so", () => {
  warnings.length = 0;
  installWindow({ throwOnWrite: true });
  store.reloadAddedApps();
  store.addApp("shop-website");
  assert.deepEqual(store.getAddedAppIds(), ["shop-website"]);
  assert.match(warnings[0], /could not save the added apps/);
});
