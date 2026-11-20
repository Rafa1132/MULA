import assert from "node:assert/strict";
import test from "node:test";
import { inventoryFromTeam, modelItemId, toolsetItemId } from "../../inventory/services/inventory.ts";
import { approvalsFor, emptyDraft, firstErrorField, INSTRUCTIONS_MAX, isDirty, isValid, NAME_MAX, needsApprovalByDefault, validateDraft } from "../services/agentForm.ts";
import { TEAM, WORKSPACE } from "../../inventory/tests/fixtures.mjs";

const inventory = inventoryFromTeam(TEAM, WORKSPACE);
const context = { workspaceId: WORKSPACE, inventory, otherAgents: [{ id: "operator", name: "Operator" }, { id: "forecasting", name: "Forecasting" }] };
const valid = { ...emptyDraft(inventory, WORKSPACE), name: "Stock keeper", tools: ["csv_read"], approvals: { csv_read: false } };

test("a fresh form preselects the default model and is not valid yet", () => {
  const draft = emptyDraft(inventory, WORKSPACE);
  assert.equal(draft.model, modelItemId("local"));
  const errors = validateDraft(draft, context);
  assert.deepEqual(Object.keys(errors).sort(), ["capabilities", "name"]);
  assert.equal(firstErrorField(errors), "name");
});

test("a complete draft is valid", () => {
  assert.deepEqual(validateDraft(valid, context), {});
  assert.equal(isValid(validateDraft(valid, context)), true);
  assert.equal(isValid(validateDraft({ ...valid, tools: [], skills: [], approvals: {} }, context)), false);
});

test("the name is required, trimmed, limited and unique in the workspace (case-insensitive)", () => {
  assert.match(validateDraft({ ...valid, name: "   " }, context).name, /Give the agent a name/);
  assert.match(validateDraft({ ...valid, name: "x".repeat(NAME_MAX + 1) }, context).name, /at most 40/);
  assert.match(validateDraft({ ...valid, name: " forecasting " }, context).name, /already called forecasting/);
  // Server agent ids count too, so "operator" can't be reused as a name.
  assert.ok(validateDraft({ ...valid, name: "OPERATOR" }, context).name);
  // Editing an agent leaves it out of otherAgents, so it may keep its own name.
  assert.equal(validateDraft({ ...valid, name: "Operator" }, { ...context, otherAgents: [] }).name, undefined);
});

test("at least one tool or skill is required", () => {
  assert.equal(validateDraft({ ...valid, tools: [], approvals: {} }, context).capabilities, "Choose at least one tool or skill.");
});

test("a model must be chosen, and must be usable", () => {
  assert.equal(validateDraft({ ...valid, model: "" }, context).model, "Choose a model.");
  assert.match(validateDraft({ ...valid, model: modelItemId("claude") }, context).model, /isn't installed or connected/);
  assert.equal(firstErrorField(validateDraft({ ...valid, model: "" }, context)), "model");
});

test("only working items from this workspace can be chosen", () => {
  assert.match(validateDraft({ ...valid, tools: ["csv_read", toolsetItemId("web")] }, context).tools, /Web search isn't installed/);
  assert.match(validateDraft({ ...valid, tools: ["made_up"] }, context).tools, /no longer in this workspace/);
  assert.match(validateDraft({ ...valid, skills: ["sample:monthly_stock_report"] }, context).skills, /Monthly stock report isn't installed/);
  const otherWorkspace = inventoryFromTeam(TEAM, "22222222-2222-4222-8222-222222222222");
  assert.ok(validateDraft(valid, { ...context, inventory: otherWorkspace }).tools, "another workspace's inventory doesn't count");
});

test("hand-offs must name agents that still exist", () => {
  assert.equal(validateDraft({ ...valid, handsWorkTo: ["forecasting"] }, context).handsWorkTo, undefined);
  assert.match(validateDraft({ ...valid, handsWorkTo: ["ghost"] }, context).handsWorkTo, /ghost is no longer/);
});

test("instructions are limited", () => {
  assert.equal(validateDraft({ ...valid, instructions: "x".repeat(INSTRUCTIONS_MAX) }, context).instructions, undefined);
  assert.match(validateDraft({ ...valid, instructions: "x".repeat(INSTRUCTIONS_MAX + 1) }, context).instructions, /4,000/);
});

test("tools that change data, send messages or move money need approval by default", () => {
  const byId = new Map(inventory.map((item) => [item.id, item]));
  assert.equal(needsApprovalByDefault(byId.get("memory_write")), true);
  assert.equal(needsApprovalByDefault(byId.get("csv_read")), false);
  assert.equal(needsApprovalByDefault(undefined), true, "an unknown tool is treated with care");
  assert.deepEqual(approvalsFor(["csv_read", "memory_write"], {}, inventory, WORKSPACE), { csv_read: false, memory_write: true });
});

test("approvals keep the owner's choices and drop deselected tools", () => {
  assert.deepEqual(approvalsFor(["memory_write", "naive"], { memory_write: false, csv_read: true }, inventory, WORKSPACE), { memory_write: false, naive: false });
});

test("a draft is dirty only when something changed", () => {
  const draft = emptyDraft(inventory, WORKSPACE);
  assert.equal(isDirty({ ...draft }, draft), false);
  assert.equal(isDirty({ ...draft, instructions: "Be brief." }, draft), true);
});
