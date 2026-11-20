// The cards in the My agents list view: the server's agents (the same data the map uses) and the
// agents added with the Add agent form, each with a status and any inventory warning.
import type { InventoryItem } from "../../inventory/types.ts";
import { referenceIssues, warningText } from "../../inventory/services/correlation.ts";
import { agentStatus } from "./map.ts";
import type { Agent } from "./team.ts";
import type { WorkspaceAgent } from "./workspaceAgents.ts";

export type AgentCardData = {
  id: string;
  name: string;
  role: string;
  // server: defined in server/agents/ (also on the map); added: made with the Add agent form.
  kind: "server" | "added";
  status: { text: string; state: "ready" | "attention" | "saved" };
  // The correlation warning (features/inventory), when an item it uses was removed or broke.
  warning: string | null;
};

const ROLE_MAX = 90;

/** A short role: the first sentence of the description, cut at a word if it is long. */
export function shortRole(text: string) {
  const clean = text.trim();
  const sentence = clean.split(/(?<=[.!?])\s/)[0] ?? "";
  if (sentence.length <= ROLE_MAX) return sentence;
  const cut = sentence.slice(0, ROLE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 40) return `${cut.slice(0, lastSpace)}…`;
  return `${cut}…`;
}

export function serverCard(agent: Agent): AgentCardData {
  const status = agentStatus(agent);
  let state: AgentCardData["status"]["state"] = "ready";
  if (status.warning) state = "attention";
  return { id: agent.id, name: agent.name, role: shortRole(agent.description), kind: "server", status: { text: status.text, state }, warning: null };
}

export function addedCard(agent: WorkspaceAgent, inventory: InventoryItem[], workspaceId: string): AgentCardData {
  let role = agent.role;
  if (!role) role = shortRole(agent.description);
  if (!role) role = "No role set";
  // Saved in this browser; Mula doesn't run it until it is connected to the server (see the README).
  return {
    id: agent.id, name: agent.name, role, kind: "added",
    status: { text: "Saved · not running yet", state: "saved" },
    warning: warningText(referenceIssues(agent, inventory, workspaceId)),
  };
}

export function agentCards(serverAgents: Agent[], added: WorkspaceAgent[], inventory: InventoryItem[], workspaceId: string) {
  return [...serverAgents.map(serverCard), ...added.map((agent) => addedCard(agent, inventory, workspaceId))];
}
