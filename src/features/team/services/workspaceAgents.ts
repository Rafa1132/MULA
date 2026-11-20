// Agents the owner adds with the Add agent form. The server defines its agents in server/agents/*.md
// and has no "create agent" endpoint yet, so for now these are kept in this browser, per project.
// Every page reaches them only through the async functions below, so they can later call an API
// (for example POST /api/team) without the form or the list changing.
//
// An agent holds only the ids of the inventory items it uses (features/inventory). Deleting an agent
// removes the agent alone and never touches the inventory.
import type { InventoryReferences } from "../../inventory/types.ts";

export type AgentDraft = InventoryReferences & {
  name: string;
  description: string;
  role: string;
  // Per selected tool id: true when the owner must approve each use.
  approvals: Record<string, boolean>;
  // Agents this one may hand work to; they become lines on the My agents map once the server runs them.
  handsWorkTo: string[];
  instructions: string;
};

export type WorkspaceAgent = AgentDraft & {
  id: string;
  workspaceId: string;
  createdAt: number;
  updatedAt: number;
};

type AgentStorage = Pick<Storage, "getItem" | "setItem">;

// Server agent ids must match ^[a-z][a-z0-9_]{0,25}$ (server/src/common/agent_catalog.py), so ids
// made here already fit if the agent is later written to server/agents/<id>.md.
const ID_MAX = 26;

export function workspaceAgentsKey(workspaceId: string) {
  return `mula.agents.workspace.${workspaceId}`;
}

/** A server-compatible id from the agent's name, unique among `taken`. */
export function agentIdFor(name: string, taken: Iterable<string>) {
  const used = new Set(taken);
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(base)) base = `agent_${base}`.replace(/_+$/, "");
  base = base.slice(0, ID_MAX).replace(/_+$/, "");
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const ending = `_${suffix}`;
    const candidate = base.slice(0, ID_MAX - ending.length).replace(/_+$/, "") + ending;
    if (!used.has(candidate)) return candidate;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** A stored entry is kept only if it has every field with the right type and belongs to this workspace. */
function isWorkspaceAgent(value: unknown, workspaceId: string): value is WorkspaceAgent {
  if (!value || typeof value !== "object") return false;
  const agent = value as Record<string, unknown>;
  const strings = ["id", "workspaceId", "name", "description", "role", "model", "instructions"].every((key) => typeof agent[key] === "string");
  const lists = isStringArray(agent.tools) && isStringArray(agent.skills) && isStringArray(agent.handsWorkTo);
  const approvals = !!agent.approvals && typeof agent.approvals === "object" && Object.values(agent.approvals).every((entry) => typeof entry === "boolean");
  return strings && lists && approvals && typeof agent.createdAt === "number" && typeof agent.updatedAt === "number" && agent.workspaceId === workspaceId;
}

/** Reads this workspace's agents. Missing, blocked or malformed storage reads as no agents. */
export function readWorkspaceAgents(workspaceId: string, storage: AgentStorage | null): WorkspaceAgent[] {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(workspaceAgentsKey(workspaceId)) ?? null;
  } catch {
    // Blocked storage (private windows) is the same as no saved agents.
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => isWorkspaceAgent(entry, workspaceId));
  } catch {
    return [];
  }
}

function writeWorkspaceAgents(workspaceId: string, agents: WorkspaceAgent[], storage: AgentStorage | null) {
  if (!storage) throw new Error("This browser can't save agents (storage is turned off).");
  try {
    storage.setItem(workspaceAgentsKey(workspaceId), JSON.stringify(agents));
  } catch {
    throw new Error("This browser couldn't save the agent. Free up space or allow site data, then try again.");
  }
}

function cleanDraft(draft: AgentDraft): AgentDraft {
  // Approvals are kept only for tools the agent still has.
  const approvals: Record<string, boolean> = {};
  for (const tool of draft.tools) approvals[tool] = draft.approvals[tool] === true;
  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    role: draft.role.trim(),
    approvals,
  };
}

export async function listWorkspaceAgents(workspaceId: string, storage: AgentStorage | null) {
  return readWorkspaceAgents(workspaceId, storage);
}

/** Saves a new agent. `takenIds` are the ids of every other agent in the workspace, server ones included. */
export async function createWorkspaceAgent(workspaceId: string, draft: AgentDraft, takenIds: string[], storage: AgentStorage | null, now = Date.now()) {
  const agents = readWorkspaceAgents(workspaceId, storage);
  const clean = cleanDraft(draft);
  const id = agentIdFor(clean.name, [...takenIds, ...agents.map((agent) => agent.id)]);
  const agent: WorkspaceAgent = { ...clean, id, workspaceId, createdAt: now, updatedAt: now };
  writeWorkspaceAgents(workspaceId, [...agents, agent], storage);
  return agent;
}

export async function updateWorkspaceAgent(workspaceId: string, id: string, draft: AgentDraft, storage: AgentStorage | null, now = Date.now()) {
  const agents = readWorkspaceAgents(workspaceId, storage);
  const existing = agents.find((agent) => agent.id === id);
  if (!existing) throw new Error("This agent no longer exists. It may have been deleted in another tab.");
  const updated: WorkspaceAgent = { ...existing, ...cleanDraft(draft), updatedAt: now };
  writeWorkspaceAgents(workspaceId, agents.map((agent) => {
    if (agent.id === id) return updated;
    return agent;
  }), storage);
  return updated;
}

/**
 * Deletes one agent. The inventory isn't involved, and other agents that hand work to it keep their
 * setting; the form shows it as an agent that no longer exists, so the owner decides.
 */
export async function deleteWorkspaceAgent(workspaceId: string, id: string, storage: AgentStorage | null) {
  const agents = readWorkspaceAgents(workspaceId, storage);
  const remaining = agents.filter((agent) => agent.id !== id);
  writeWorkspaceAgents(workspaceId, remaining, storage);
  return remaining;
}

/** The browser's storage, or null where it is missing or blocked. */
export function browserStorage(): AgentStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
