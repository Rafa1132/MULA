// The Add agent form's rules: limits, defaults and validation. Pure, so they are unit tested.
import type { InventoryItem } from "../../inventory/types.ts";
import { isUsable } from "../../inventory/services/inventory.ts";
import { findInWorkspace, referenceIssues } from "../../inventory/services/correlation.ts";
import type { ReferenceIssue } from "../../inventory/services/correlation.ts";
import type { AgentDraft } from "./workspaceAgents.ts";

export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 160;
export const ROLE_MAX = 60;
// The same limit as an agent's instructions in the settings panel.
export const INSTRUCTIONS_MAX = 4000;
export const SUGGESTED_ROLES = ["Finance", "Sales", "Marketing", "Support", "Operations", "Developer"];

// "capabilities" is the "at least one tool or skill" rule, shown above the Tools list.
export type AgentField = "name" | "description" | "role" | "capabilities" | "tools" | "skills" | "model" | "handsWorkTo" | "instructions";
export type AgentFormErrors = Partial<Record<AgentField, string>>;

// The order fields appear in the form, so focus can go to the first error.
export const FIELD_ORDER: AgentField[] = ["name", "description", "role", "capabilities", "tools", "skills", "model", "handsWorkTo", "instructions"];

/** Another agent in the workspace, server-defined or added here. */
export type AgentSummary = { id: string; name: string };

export type FormContext = {
  workspaceId: string;
  inventory: InventoryItem[];
  // Every other agent in the workspace (the agent being edited is left out).
  otherAgents: AgentSummary[];
};

/** A fresh form: the workspace's default model is preselected, if there is a usable one. */
export function emptyDraft(inventory: InventoryItem[], workspaceId: string): AgentDraft {
  const model = inventory.find((entry) => entry.type === "model" && entry.isDefault && entry.workspaceId === workspaceId && isUsable(entry));
  let modelId = "";
  if (model) modelId = model.id;
  return { name: "", description: "", role: "", tools: [], skills: [], model: modelId, approvals: {}, handsWorkTo: [], instructions: "" };
}

/** Tools that send messages, move money or change data need the owner's approval by default. */
export function needsApprovalByDefault(item: InventoryItem | undefined) {
  if (!item) return true;
  return item.sideEffects.length > 0;
}

/**
 * Approvals after the tool selection changed: tools still selected keep the owner's choice, newly
 * selected tools get their default, and deselected tools are dropped.
 */
export function approvalsFor(tools: string[], current: Record<string, boolean>, inventory: InventoryItem[], workspaceId: string) {
  const next: Record<string, boolean> = {};
  for (const tool of tools) {
    if (tool in current) next[tool] = current[tool];
    else next[tool] = needsApprovalByDefault(findInWorkspace(tool, inventory, workspaceId));
  }
  return next;
}

function referenceMessage(issue: ReferenceIssue) {
  if (issue.problem === "removed") return `${issue.name} is no longer in this workspace's inventory. Remove it to continue.`;
  if (issue.problem === "wrong_type") return `${issue.name} can't be used here.`;
  return `${issue.name} isn't installed or connected. Set it up in Inventory, or remove it.`;
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function validateDraft(draft: AgentDraft, context: FormContext): AgentFormErrors {
  const errors: AgentFormErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = "Give the agent a name.";
  else if (name.length > NAME_MAX) errors.name = `Use at most ${NAME_MAX} characters.`;
  else if (context.otherAgents.some((agent) => sameName(agent.name, name) || sameName(agent.id, name))) {
    errors.name = `Another agent in this workspace is already called ${name}.`;
  }

  if (draft.description.trim().length > DESCRIPTION_MAX) errors.description = `Use at most ${DESCRIPTION_MAX} characters.`;
  if (draft.role.trim().length > ROLE_MAX) errors.role = `Use at most ${ROLE_MAX} characters.`;
  if (draft.tools.length + draft.skills.length === 0) errors.capabilities = "Choose at least one tool or skill.";

  // Only items from this workspace's inventory that work right now may be chosen (correlation rule 1).
  const issues = referenceIssues(draft, context.inventory, context.workspaceId);
  const first = (field: ReferenceIssue["field"]) => issues.find((issue) => issue.field === field);
  const toolIssue = first("tools");
  if (toolIssue) errors.tools = referenceMessage(toolIssue);
  const skillIssue = first("skills");
  if (skillIssue) errors.skills = referenceMessage(skillIssue);
  const modelIssue = first("model");
  if (!draft.model) errors.model = "Choose a model.";
  else if (modelIssue) errors.model = referenceMessage(modelIssue);

  const known = new Set(context.otherAgents.map((agent) => agent.id));
  const missing = draft.handsWorkTo.find((id) => !known.has(id));
  if (missing) errors.handsWorkTo = `${missing} is no longer in this workspace. Remove it to continue.`;

  if (draft.instructions.length > INSTRUCTIONS_MAX) errors.instructions = `Use at most ${INSTRUCTIONS_MAX.toLocaleString("en")} characters.`;
  return errors;
}

export function isValid(errors: AgentFormErrors) {
  return Object.keys(errors).length === 0;
}

/** The first field with an error, in the order the form shows them, or null. */
export function firstErrorField(errors: AgentFormErrors): AgentField | null {
  return FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null;
}

/** The editable part of a saved agent, so the detail panel can reuse the form. */
export function draftOf(agent: AgentDraft): AgentDraft {
  return {
    name: agent.name, description: agent.description, role: agent.role, tools: [...agent.tools], skills: [...agent.skills],
    model: agent.model, approvals: { ...agent.approvals }, handsWorkTo: [...agent.handsWorkTo], instructions: agent.instructions,
  };
}

export function isDirty(draft: AgentDraft, initial: AgentDraft) {
  return JSON.stringify(draftOf(draft)) !== JSON.stringify(draftOf(initial));
}
