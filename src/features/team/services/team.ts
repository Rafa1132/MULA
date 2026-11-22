import type { Stamina } from "./stamina";
import type { SupportSettings } from "./templates";
import { projectFetch } from "../../../common/services/project.ts";

export type Brain = {
  name: string;
  description: string;
  location: "local" | "cloud";
  // Who receives this agent's messages, for example "this computer" or "OpenRouter · Chutes".
  host: string;
  // Cloud brains only: the server script that sets the brain up and the key it asks for.
  setup_script?: string;
  setup_key?: string;
  // "unchecked" means the runtime could not be reached to confirm the brain is set up.
  status: "ready" | "needs_setup" | "unchecked";
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  data: string;
  tools: string[];
  available_tools: Record<string, string>;
  revision: number;
  brain: string;
  available_brains: Record<string, Brain>;
  // Agents this one may ever ask for help (its file's delegates_to); empty for agents that never ask.
  delegates_to: string[];
  // How it may ask each of them (A2A, see server/src/features/a2a): one entry per delegates_to id.
  links: Record<string, LinkMode>;
  // The runtime's own tools the owner may switch on for this agent, and those switched on.
  available_toolsets: string[];
  runtime_toolsets: string[];
  // Each toolset's runtime tool names, and whether it can be switched on yet.
  toolset_tools: Record<string, string[]>;
  toolset_status: Record<string, ToolsetStatus>;
  // Tokens used and allowed this period; limit null means unlimited. The server doesn't send it yet,
  // so a missing value is read as unlimited (see services/stamina.ts).
  stamina?: Stamina;
  // Agents added from a template (Customer Service) only: tone, channels and allowlist.
  support?: SupportSettings;
};

// ask: the owner approves each request; auto: requests run right after the reply; off: connected but
// switched off; none: not connected.
export type LinkMode = "ask" | "auto" | "off" | "none";
// ready: works now; paid: works but may spend cloud credits; needs_setup: can't be switched on yet.
export type ToolsetStatus = { status: "ready" | "paid" | "needs_setup"; note: string };

// A key that lets an Agent Client Protocol client (an editor) talk to one agent. The key itself is
// only ever in the create response, never in a listing.
export type ClientKey = { id: string; agent_id: string; label: string; created: number; last_used: number | null; revoked_at: number | null };

// An agent's A2A card, as the server generates it from the agent's file.
export type AgentCard = {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  version: string;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: { id: string; name: string; description: string; tags: string[] }[];
};

export async function saveLayout(positions: Record<string, { x: number; y: number }>) {
  const result = await teamRequest("/api/team/layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions }) });
  return result.layout;
}

export async function resetLayout() {
  const result = await teamRequest("/api/team/layout", { method: "DELETE" });
  return result.layout;
}

export async function teamRequest(path: string, options?: RequestInit) {
  const response = await projectFetch(path, { cache: "no-store", ...options });
  if (!response.ok) {
    let message = "Could not complete this request. Please try again.";
    if (response.status === 404) message = "Restart Mula with ./run.sh to load agent settings and forecasting.";
    if (response.status === 401) message = "Your session expired. Sign in again.";
    try {
      const body = await response.json();
      if (typeof body.detail === "string" && body.detail !== "Not Found") message = body.detail;
    } catch { /* A proxy may return HTML; keep the readable fallback above. */ }
    throw new Error(message);
  }
  return response.json();
}
