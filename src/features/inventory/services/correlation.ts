// How agents and the inventory relate:
// 1. An agent may only reference inventory items that exist in its own workspace.
// 2. If an item it uses is removed or stops working (disconnected, needs setup, error), the agent
//    shows a warning badge. The agent itself is kept as it is; nothing is deleted or rewritten.
// 3. Deleting an agent never touches the inventory (agents only hold item ids, see features/team).
import type { InventoryItem, InventoryReferences, InventoryStatus, InventoryType } from "../types.ts";
import { isUsable } from "./inventory.ts";

export type ReferenceField = "tools" | "skills" | "model";

export type ReferenceIssue = {
  field: ReferenceField;
  id: string;
  // removed: no such item in this workspace; wrong_type: the id is another kind of item;
  // unavailable: the item exists but isn't installed or connected.
  problem: "removed" | "wrong_type" | "unavailable";
  // The item's name when it still exists, else its id.
  name: string;
  status?: InventoryStatus;
};

const FIELD_TYPES: Record<ReferenceField, InventoryType> = { tools: "tool", skills: "skill", model: "model" };

/** The item with this id in this workspace, or undefined. Items from other workspaces never match. */
export function findInWorkspace(id: string, inventory: InventoryItem[], workspaceId: string) {
  return inventory.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
}

function issueFor(field: ReferenceField, id: string, inventory: InventoryItem[], workspaceId: string): ReferenceIssue | null {
  const found = findInWorkspace(id, inventory, workspaceId);
  if (!found) return { field, id, problem: "removed", name: id };
  if (found.type !== FIELD_TYPES[field]) return { field, id, problem: "wrong_type", name: found.name };
  if (!isUsable(found)) return { field, id, problem: "unavailable", name: found.name, status: found.status };
  return null;
}

/** Every reference that is missing, of the wrong kind, or not usable right now, in field order. */
export function referenceIssues(references: InventoryReferences, inventory: InventoryItem[], workspaceId: string): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  const check = (field: ReferenceField, id: string) => {
    const issue = issueFor(field, id, inventory, workspaceId);
    if (issue) issues.push(issue);
  };
  for (const id of references.tools) check("tools", id);
  for (const id of references.skills) check("skills", id);
  if (references.model) check("model", references.model);
  return issues;
}

/** The warning badge's text for an agent, or null when everything it uses works. */
export function warningText(issues: ReferenceIssue[]) {
  if (issues.length === 0) return null;
  const removed = issues.filter((issue) => issue.problem !== "unavailable").length;
  const unavailable = issues.length - removed;
  const parts: string[] = [];
  if (removed > 0) parts.push(`${removed} removed`);
  if (unavailable === 1) parts.push("1 needs setup");
  if (unavailable > 1) parts.push(`${unavailable} need setup`);
  return `Check inventory: ${parts.join(", ")}`;
}

/** One sentence per issue, for the agent's detail panel. */
export function describeIssue(issue: ReferenceIssue) {
  if (issue.problem === "removed") return `${issue.name} is no longer in this workspace's inventory.`;
  if (issue.problem === "wrong_type") return `${issue.name} isn't a ${FIELD_TYPES[issue.field]}.`;
  return `${issue.name} isn't installed or connected right now.`;
}
