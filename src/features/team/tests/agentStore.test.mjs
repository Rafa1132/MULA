import assert from "node:assert/strict";
import test from "node:test";
import { AgentStoreError, connectionsFrom, connectionsKey, panelTabKey, parseConnections, withConnection, withoutConnection } from "../services/agentStore.ts";

const team = [
  { id: "operator", delegates_to: ["forecasting"] },
  { id: "forecasting", delegates_to: [] },
  { id: "inventory", delegates_to: [] },
];

test("connections start from the server's delegates_to, then this browser's saved lists win", () => {
  assert.deepEqual(connectionsFrom(team, null), { operator: ["forecasting"], forecasting: [], inventory: [] });
  assert.deepEqual(connectionsFrom(team, { operator: [], inventory: ["operator"] }), { operator: [], forecasting: [], inventory: ["operator"] });
  // Unknown agents, self-connections and duplicates are dropped.
  assert.deepEqual(connectionsFrom(team, { operator: ["ghost", "operator", "inventory", "inventory"] }).operator, ["inventory"]);
});

test("saved connections are read only when well-formed", () => {
  assert.deepEqual(parseConnections('{"version":1,"connections":{"operator":["inventory",3]}}'), { operator: ["inventory"] });
  assert.equal(parseConnections(null), null);
  assert.equal(parseConnections("not json"), null);
  assert.equal(parseConnections('{"version":2,"connections":{}}'), null);
  assert.equal(parseConnections('{"version":1}'), null);
});

test("adding and removing connections never mutates and refuses impossible ones", () => {
  const start = connectionsFrom(team, null);
  const added = withConnection(start, team, "operator", "inventory");
  assert.deepEqual(added.operator, ["forecasting", "inventory"]);
  assert.deepEqual(start.operator, ["forecasting"]);
  assert.equal(withConnection(added, team, "operator", "inventory"), added);
  assert.deepEqual(withoutConnection(added, "operator", "forecasting").operator, ["inventory"]);
  assert.throws(() => withConnection(start, team, "operator", "operator"), AgentStoreError);
  assert.throws(() => withConnection(start, team, "operator", "ghost"), AgentStoreError);
});

test("storage keys are per user", () => {
  assert.equal(connectionsKey("rafa"), "mula.team.agents.rafa");
  assert.equal(panelTabKey("rafa"), "mula.team.panel-tab.rafa");
});
