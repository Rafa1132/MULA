export type Brain = {
  name: string;
  description: string;
  location: "local" | "cloud";
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
  // Agents this one may ask for help; empty for agents that never ask.
  delegates_to: string[];
  // Null when delegates_to is empty.
  delegation: Delegation | null;
};

// ask: the owner approves each request; auto: requests run right after the reply; off: never ask.
export type Delegation = "ask" | "auto" | "off";

export async function saveLayout(positions: Record<string, { x: number; y: number }>) {
  const result = await teamRequest("/api/team/layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions }) });
  return result.layout;
}

export async function resetLayout() {
  const result = await teamRequest("/api/team/layout", { method: "DELETE" });
  return result.layout;
}

export async function teamRequest(path: string, options?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...options });
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
