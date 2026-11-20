// The agent store shared by the My agents map and the settings panel.
//
// Agents come from /api/team, and every setting is the server's: instructions, reference data,
// tools, brain, runtime tools and links to other agents (A2A). Saving goes to PUT /api/team/{agent};
// the server is what enforces each setting, never this module. Connections (the map's lines) are
// read from each agent's saved links. The only thing kept in this browser is the panel tab last
// chosen, per user.
import { useSyncExternalStore } from "react";
import type { Agent } from "./team";

// Agent id → the ids of agents it is connected to (any link mode except "none").
export type Connections = Record<string, string[]>;
export type AgentStoreSnapshot = { username: string; agents: Agent[]; connections: Connections };

const PANEL_TABS = ["simple", "advanced"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];
const EMPTY: AgentStoreSnapshot = { username: "", agents: [], connections: {} };

let snapshot = EMPTY;
const listeners = new Set<() => void>();

export function panelTabKey(username: string) {
  return `mula.team.panel-tab.${username}`;
}

/** Each agent's connections from its saved links. Unknown agents and self-links are dropped. */
export function connectionsFrom(agents: Agent[]): Connections {
  const ids = new Set(agents.map((agent) => agent.id));
  const result: Connections = {};
  for (const agent of agents) {
    const links = agent.links ?? {};
    result[agent.id] = Object.keys(links).filter((id) => links[id] !== "none" && ids.has(id) && id !== agent.id);
  }
  return result;
}

/** Load the team from the server response. */
export function loadAgents(username: string, agents: Agent[]) {
  snapshot = { username, agents, connections: connectionsFrom(agents) };
  emit();
}

/** Replace one agent with the server's copy after a save. */
export function replaceAgent(saved: Agent) {
  const agents = snapshot.agents.map((agent) => {
    if (agent.id === saved.id) return saved;
    return agent;
  });
  snapshot = { ...snapshot, agents, connections: connectionsFrom(agents) };
  emit();
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

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch (failure) {
    console.warn("Mula could not read browser storage; using the default settings tab.", failure);
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (failure) {
    console.warn("Mula could not save to browser storage; this choice lasts only for this visit.", failure);
  }
}
