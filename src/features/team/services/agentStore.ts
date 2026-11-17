// PROTOTYPE STORE for agent settings, shared by the My agents map and the settings panel.
//
// Agents come from /api/team. Fields the server already saves (instructions, reference data, tools,
// brain, delegation) still go to PUT /api/team/{agent}; the server's require_tool is what actually
// blocks a disabled tool, never this module. Connections (which agents an agent may hand work to)
// have no server record yet, so they live here, in this browser's localStorage, per user. Real
// persistence needs agent records on the server; see the README.
import { useSyncExternalStore } from "react";
import type { Agent } from "./team";

// Agent id → the ids of agents it may hand work to.
export type Connections = Record<string, string[]>;
export type AgentStoreSnapshot = { username: string; agents: Agent[]; connections: Connections };

/** Thrown for a connection that can't exist, such as an agent connected to itself. */
export class AgentStoreError extends Error {}

const STORAGE_VERSION = 1;
const PANEL_TABS = ["simple", "advanced"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];
const EMPTY: AgentStoreSnapshot = { username: "", agents: [], connections: {} };

let snapshot = EMPTY;
const listeners = new Set<() => void>();

export function connectionsKey(username: string) {
  return `mula.team.agents.${username}`;
}

export function panelTabKey(username: string) {
  return `mula.team.panel-tab.${username}`;
}

/**
 * Each agent's connections: the saved list when there is one, else the server's delegates_to.
 * Unknown agents, self-connections and duplicates are dropped.
 */
export function connectionsFrom(agents: Agent[], saved: Connections | null): Connections {
  const ids = new Set(agents.map((agent) => agent.id));
  const result: Connections = {};
  for (const agent of agents) {
    let targets = agent.delegates_to;
    if (saved && Array.isArray(saved[agent.id])) targets = saved[agent.id];
    result[agent.id] = [...new Set(targets)].filter((id) => ids.has(id) && id !== agent.id);
  }
  return result;
}

/** Saved connections from storage text, or null when missing or malformed. */
export function parseConnections(raw: string | null): Connections | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value !== "object" || value === null || value.version !== STORAGE_VERSION) return null;
    const connections = value.connections;
    if (typeof connections !== "object" || connections === null) return null;
    const result: Connections = {};
    for (const [id, targets] of Object.entries(connections)) {
      if (Array.isArray(targets)) result[id] = targets.filter((target): target is string => typeof target === "string");
    }
    return result;
  } catch {
    // Unreadable JSON falls back to the server's defaults rather than breaking the map.
    return null;
  }
}

export function withConnection(connections: Connections, agents: Agent[], from: string, to: string): Connections {
  const ids = new Set(agents.map((agent) => agent.id));
  if (!ids.has(from) || !ids.has(to)) throw new AgentStoreError("That agent isn't on your team.");
  if (from === to) throw new AgentStoreError("An agent can't hand work to itself.");
  const current = connections[from] ?? [];
  if (current.includes(to)) return connections;
  return { ...connections, [from]: [...current, to] };
}

export function withoutConnection(connections: Connections, from: string, to: string): Connections {
  const current = connections[from] ?? [];
  return { ...connections, [from]: current.filter((id) => id !== to) };
}

/** Load the team from the server response, applying this user's saved connections. */
export function loadAgents(username: string, agents: Agent[]) {
  snapshot = { username, agents, connections: connectionsFrom(agents, parseConnections(read(connectionsKey(username)))) };
  emit();
}

/** Replace one agent with the server's copy after a save. */
export function replaceAgent(saved: Agent) {
  const agents = snapshot.agents.map((agent) => {
    if (agent.id === saved.id) return saved;
    return agent;
  });
  snapshot = { ...snapshot, agents };
  emit();
}

export function addConnection(from: string, to: string) {
  setConnections(withConnection(snapshot.connections, snapshot.agents, from, to));
}

export function removeConnection(from: string, to: string) {
  setConnections(withoutConnection(snapshot.connections, from, to));
}

export function useAgentStore() {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

/** The settings tab last chosen by this user: "simple" unless "advanced" was saved. */
export function readPanelTab(username: string): PanelTab {
  if (read(panelTabKey(username)) === "advanced") return "advanced";
  return "simple";
}

export function savePanelTab(username: string, tab: PanelTab) {
  write(panelTabKey(username), tab);
}

function setConnections(connections: Connections) {
  snapshot = { ...snapshot, connections };
  write(connectionsKey(snapshot.username), JSON.stringify({ version: STORAGE_VERSION, connections }));
  emit();
}

function emit() {
  for (const listener of listeners) listener();
}

// Another tab changed this user's connections: pick them up so both maps agree.
function onStorage(event: StorageEvent) {
  if (event.key !== connectionsKey(snapshot.username)) return;
  snapshot = { ...snapshot, connections: connectionsFrom(snapshot.agents, parseConnections(event.newValue)) };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch (failure) {
    console.warn("Mula could not read browser storage; using the default agent settings.", failure);
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (failure) {
    console.warn("Mula could not save to browser storage; this change lasts only for this visit.", failure);
  }
}
