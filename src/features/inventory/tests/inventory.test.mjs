import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FILTER, filterInventory, groupByType, inventoryFromTeam, isUsable, itemAnchor, modelItemId, setupLink, toolsetItemId } from "../services/inventory.ts";
import { TEAM, WORKSPACE } from "./fixtures.mjs";

test("the inventory lists each tool, toolset and model once, plus labelled samples", () => {
  const items = inventoryFromTeam(TEAM, WORKSPACE);
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicates across agents");
  for (const id of ["csv_read", "memory_read", "memory_write", "naive", toolsetItemId("web"), toolsetItemId("todo"), modelItemId("local"), modelItemId("claude")]) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(items.every((item) => item.workspaceId === WORKSPACE));
  const samples = items.filter((item) => item.sample);
  assert.ok(samples.some((item) => item.type === "skill") && samples.some((item) => item.type === "connector"));
  assert.ok(samples.every((item) => !isUsable(item)), "samples can never be chosen");
});

test("statuses, config and side effects come from the server's data", () => {
  const byId = new Map(inventoryFromTeam(TEAM, WORKSPACE).map((item) => [item.id, item]));
  assert.equal(byId.get(toolsetItemId("web")).status, "needs_setup");
  assert.equal(byId.get(toolsetItemId("todo")).status, "installed");
  assert.equal(byId.get(modelItemId("local")).status, "installed");
  assert.equal(byId.get(modelItemId("openrouter")).status, "connected");
  const claude = byId.get(modelItemId("claude"));
  assert.equal(claude.status, "needs_setup");
  assert.deepEqual(claude.config, [{ key: "ANTHROPIC_API_KEY", label: "Anthropic API key", required: true, secret: true }]);
  assert.match(claude.setupHint, /enable_claude\.py/);
  assert.deepEqual(byId.get("memory_write").sideEffects, ["changes_data"]);
  assert.deepEqual(byId.get("csv_read").sideEffects, []);
});

test("the default model is the Operator's brain, or the first usable model", () => {
  const defaults = (team) => inventoryFromTeam(team, WORKSPACE).filter((item) => item.isDefault).map((item) => item.id);
  assert.deepEqual(defaults(TEAM), [modelItemId("local")]);
  // The Operator's brain needs setup, so the first usable one is chosen instead.
  const claudeOperator = [{ ...TEAM[0], brain: "claude" }, TEAM[1]];
  assert.deepEqual(defaults(claudeOperator), [modelItemId("local")]);
  assert.deepEqual(defaults([TEAM[1]]), [modelItemId("local")]);
});

test("filters combine type, status and a case-insensitive search", () => {
  const items = inventoryFromTeam(TEAM, WORKSPACE);
  assert.equal(filterInventory(items, EMPTY_FILTER).length, items.length);
  assert.ok(filterInventory(items, { ...EMPTY_FILTER, type: "model" }).every((item) => item.type === "model"));
  assert.ok(filterInventory(items, { ...EMPTY_FILTER, status: "needs_setup" }).every((item) => item.status === "needs_setup"));
  assert.deepEqual(filterInventory(items, { ...EMPTY_FILTER, query: "  SHOPIFY " }).map((item) => item.id), ["sample:shopify"]);
  assert.deepEqual(filterInventory(items, { type: "tool", status: "installed", query: "csv" }).map((item) => item.id), ["csv_read"]);
  assert.deepEqual(filterInventory(items, { ...EMPTY_FILTER, query: "nothing like this" }), []);
});

test("groups follow tools, skills, connectors, models and skip empty ones", () => {
  const items = inventoryFromTeam(TEAM, WORKSPACE);
  assert.deepEqual(groupByType(items).map((group) => group.label), ["Tools", "Skills", "Connectors", "Models"]);
  assert.deepEqual(groupByType(filterInventory(items, { ...EMPTY_FILTER, type: "model" })).map((group) => group.type), ["model"]);
  assert.deepEqual(groupByType([]), []);
});

test("Set up links open the project's inventory at that item", () => {
  assert.equal(setupLink(WORKSPACE, "toolset:web"), `/projects/${WORKSPACE}/inventory?item=toolset%3Aweb`);
  assert.equal(itemAnchor("toolset:web"), "item-toolset-web");
});

test("a server answer without agents gives an empty inventory of samples only", () => {
  const items = inventoryFromTeam([], WORKSPACE);
  assert.ok(items.every((item) => item.sample));
});
