import assert from "node:assert/strict";
import test from "node:test";
import { inventoryFromTeam, modelItemId, toolsetItemId } from "../services/inventory.ts";
import { describeIssue, findInWorkspace, referenceIssues, warningText } from "../services/correlation.ts";
import { TEAM, WORKSPACE } from "./fixtures.mjs";

const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const inventory = inventoryFromTeam(TEAM, WORKSPACE);
const healthy = { tools: ["csv_read", toolsetItemId("todo")], skills: [], model: modelItemId("local") };

test("an agent using only working items in its workspace has no issues and no badge", () => {
  assert.deepEqual(referenceIssues(healthy, inventory, WORKSPACE), []);
  assert.equal(warningText([]), null);
});

test("items from another workspace are treated as missing", () => {
  const elsewhere = inventoryFromTeam(TEAM, OTHER_WORKSPACE);
  assert.equal(findInWorkspace("csv_read", elsewhere, WORKSPACE), undefined);
  const issues = referenceIssues(healthy, elsewhere, WORKSPACE);
  assert.deepEqual(issues.map((issue) => issue.problem), ["removed", "removed", "removed"]);
});

test("a removed item shows a warning but the agent's references are left as they were", () => {
  const withoutCsv = inventory.filter((item) => item.id !== "csv_read");
  const agent = structuredClone(healthy);
  const issues = referenceIssues(agent, withoutCsv, WORKSPACE);
  assert.deepEqual(issues, [{ field: "tools", id: "csv_read", problem: "removed", name: "csv_read" }]);
  assert.equal(warningText(issues), "Check inventory: 1 removed");
  assert.deepEqual(agent, healthy, "checking never rewrites the agent");
  assert.match(describeIssue(issues[0]), /no longer in this workspace/);
});

test("a disconnected or broken item shows a needs-setup warning", () => {
  const disconnected = inventory.map((item) => {
    if (item.id === modelItemId("local")) return { ...item, status: "error" };
    if (item.id === toolsetItemId("todo")) return { ...item, status: "needs_setup" };
    return item;
  });
  const issues = referenceIssues(healthy, disconnected, WORKSPACE);
  assert.deepEqual(issues.map((issue) => [issue.field, issue.problem, issue.status]), [["tools", "unavailable", "needs_setup"], ["model", "unavailable", "error"]]);
  assert.equal(warningText(issues), "Check inventory: 2 need setup");
  assert.equal(warningText([...issues, { field: "skills", id: "gone", problem: "removed", name: "gone" }]), "Check inventory: 1 removed, 2 need setup");
});

test("an id of the wrong kind is flagged (a model listed as a tool)", () => {
  const issues = referenceIssues({ tools: [modelItemId("local")], skills: [], model: "" }, inventory, WORKSPACE);
  assert.deepEqual(issues.map((issue) => issue.problem), ["wrong_type"]);
});
