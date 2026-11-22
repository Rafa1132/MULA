// The server's agents (server/agents/*.md) a proxied URL may name. Anything else never reaches the
// backend. Customer Service is a template: the server still answers 404 until a project adds it.
export const SERVER_AGENTS = ["operator", "forecasting", "customer_service"];

// Agents the owner can chat with on their own page; the Operator has the workspace chat.
export const DIRECT_CHAT_AGENTS = ["forecasting", "customer_service"];

// Agents added from a template, which have Customer Service settings and can be removed.
export const TEMPLATE_AGENTS = ["customer_service"];

export function agentNotFound() {
  return Response.json({ detail: "Agent not found." }, { status: 404 });
}
