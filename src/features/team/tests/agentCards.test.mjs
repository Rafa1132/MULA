import assert from "node:assert/strict";
import test from "node:test";
import { inventoryFromTeam } from "../../inventory/services/inventory.ts";
import { addedCard, agentCards, shortRole } from "../services/agentCards.ts";
import { TEAM, WORKSPACE } from "../../inventory/tests/fixtures.mjs";

const inventory = inventoryFromTeam(TEAM, WORKSPACE);
const added = { id: "stock_keeper", workspaceId: WORKSPACE, name: "Stock keeper", description: "", role: "Operations", tools: ["csv_read"], skills: [], model: "model:local", approvals: { csv_read: false }, handsWorkTo: [], instructions: "", createdAt: 1, updatedAt: 1 };

test("the short role is the description's first sentence, cut at a word", () => {
  assert.equal(shortRole("Plans stock. Also other things."), "Plans stock.");
  const long = shortRole(`${"word ".repeat(40)}end.`);
  assert.ok(long.length <= 91 && long.endsWith("…"));
  assert.equal(shortRole("  "), "");
});

test("server agents keep the map's status; added agents say they aren't running yet", () => {
  const server = { ...TEAM[0], description: "Runs the business day to day.", tools: [], available_brains: TEAM[0].available_brains };
  const [first, second] = agentCards([server], [added], inventory, WORKSPACE);
  assert.equal(first.kind, "server");
  assert.equal(first.role, "Runs the business day to day.");
  assert.equal(second.kind, "added");
  assert.equal(second.status.state, "saved");
  assert.equal(second.warning, null);
});

test("an added agent whose tool left the inventory gets a warning badge", () => {
  const shrunk = inventory.filter((item) => item.id !== "csv_read");
  assert.equal(addedCard(added, shrunk, WORKSPACE).warning, "Check inventory: 1 removed");
  assert.equal(addedCard({ ...added, role: "" }, inventory, WORKSPACE).role, "No role set");
});
