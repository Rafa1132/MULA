import assert from "node:assert/strict";
import test from "node:test";
import { connectionsFrom, panelTabKey } from "../services/agentStore.ts";

test("connections come from each agent's saved links", () => {
  const team = [
    { id: "operator", links: { forecasting: "ask" } },
    { id: "forecasting", links: { operator: "none" } },
    { id: "inventory" },
  ];
  assert.deepEqual(connectionsFrom(team), { operator: ["forecasting"], forecasting: [], inventory: [] });
  // "off" stays connected (a dashed line); "none" is not connected.
  assert.deepEqual(connectionsFrom([{ id: "operator", links: { forecasting: "off" } }, { id: "forecasting", links: {} }]).operator, ["forecasting"]);
  // Unknown agents and self-links are dropped.
  assert.deepEqual(connectionsFrom([{ id: "operator", links: { ghost: "ask", operator: "auto" } }]).operator, []);
});

test("the panel tab key is per user", () => {
  assert.equal(panelTabKey("rafa"), "mula.team.panel-tab.rafa");
});
