import assert from "node:assert/strict";
import test from "node:test";
import { inventoryFromTeam } from "../../inventory/services/inventory.ts";
import { referenceIssues } from "../../inventory/services/correlation.ts";
import { agentIdFor, createWorkspaceAgent, deleteWorkspaceAgent, listWorkspaceAgents, readWorkspaceAgents, updateWorkspaceAgent, workspaceAgentsKey } from "../services/workspaceAgents.ts";
import { TEAM, WORKSPACE } from "../../inventory/tests/fixtures.mjs";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values };
}

const draft = { name: "  Stock keeper ", description: "", role: "Operations", tools: ["csv_read", "memory_write"], skills: [], model: "model:local", approvals: { csv_read: false, memory_write: true, naive: true }, handsWorkTo: ["forecasting"], instructions: "" };

test("ids fit the server's agent id rule and never collide", () => {
  assert.equal(agentIdFor("Stock keeper", []), "stock_keeper");
  assert.equal(agentIdFor("Stock keeper", ["stock_keeper"]), "stock_keeper_2");
  assert.equal(agentIdFor("Stock keeper", ["stock_keeper", "stock_keeper_2"]), "stock_keeper_3");
  assert.equal(agentIdFor("2024 planner", []), "agent_2024_planner");
  assert.equal(agentIdFor("!!!", []), "agent");
  const long = agentIdFor("A very long agent name that keeps going", ["a_very_long_agent_name_tha"]);
  assert.match(long, /^[a-z][a-z0-9_]{0,25}$/);
  assert.notEqual(long, "a_very_long_agent_name_tha");
});

test("creating saves a trimmed agent with approvals for its own tools only", async () => {
  const storage = memoryStorage();
  const agent = await createWorkspaceAgent(WORKSPACE, draft, ["operator", "forecasting"], storage, 1000);
  assert.equal(agent.id, "stock_keeper");
  assert.equal(agent.name, "Stock keeper");
  assert.deepEqual(agent.approvals, { csv_read: false, memory_write: true });
  assert.equal(agent.createdAt, 1000);
  assert.deepEqual(await listWorkspaceAgents(WORKSPACE, storage), [agent]);
  assert.deepEqual(await listWorkspaceAgents("22222222-2222-4222-8222-222222222222", storage), [], "agents are per workspace");
});

test("updating keeps the id and creation time", async () => {
  const storage = memoryStorage();
  const agent = await createWorkspaceAgent(WORKSPACE, draft, [], storage, 1000);
  const updated = await updateWorkspaceAgent(WORKSPACE, agent.id, { ...draft, name: "Stock lead" }, storage, 2000);
  assert.equal(updated.id, agent.id);
  assert.equal(updated.createdAt, 1000);
  assert.equal(updated.updatedAt, 2000);
  await assert.rejects(updateWorkspaceAgent(WORKSPACE, "ghost", draft, storage), /no longer exists/);
});

test("deleting an agent leaves the inventory and other agents alone", async () => {
  const storage = memoryStorage();
  const inventory = inventoryFromTeam(TEAM, WORKSPACE);
  const before = structuredClone(inventory);
  const keeper = await createWorkspaceAgent(WORKSPACE, draft, [], storage);
  const helper = await createWorkspaceAgent(WORKSPACE, { ...draft, name: "Helper", handsWorkTo: [keeper.id] }, [], storage);
  const remaining = await deleteWorkspaceAgent(WORKSPACE, keeper.id, storage);
  assert.deepEqual(remaining.map((agent) => agent.id), [helper.id]);
  assert.deepEqual(inventory, before, "no inventory item was touched");
  assert.deepEqual(remaining[0].handsWorkTo, [keeper.id], "the owner decides what to do with the hand-off");
});

test("an agent whose item disappears is kept, with a warning", async () => {
  const storage = memoryStorage();
  await createWorkspaceAgent(WORKSPACE, draft, [], storage);
  const shrunk = inventoryFromTeam(TEAM, WORKSPACE).filter((item) => item.id !== "memory_write");
  const [agent] = await listWorkspaceAgents(WORKSPACE, storage);
  assert.ok(agent, "the agent is still there");
  assert.deepEqual(referenceIssues(agent, shrunk, WORKSPACE).map((issue) => issue.id), ["memory_write"]);
});

test("missing, blocked or malformed storage reads as no agents; a failed save says so", async () => {
  assert.deepEqual(readWorkspaceAgents(WORKSPACE, null), []);
  assert.deepEqual(readWorkspaceAgents(WORKSPACE, { getItem: () => { throw new Error("blocked"); } }), []);
  const storage = memoryStorage();
  storage.setItem(workspaceAgentsKey(WORKSPACE), "{not json");
  assert.deepEqual(readWorkspaceAgents(WORKSPACE, storage), []);
  storage.setItem(workspaceAgentsKey(WORKSPACE), JSON.stringify([{ id: "x" }, null]));
  assert.deepEqual(readWorkspaceAgents(WORKSPACE, storage), [], "entries missing fields are dropped");
  await assert.rejects(createWorkspaceAgent(WORKSPACE, draft, [], null), /can't save agents/);
  const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  await assert.rejects(createWorkspaceAgent(WORKSPACE, draft, [], full), /couldn't save the agent/);
});
