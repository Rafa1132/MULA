import { proxyBackend } from "@/common/services/server-proxy";
import { agentNotFound, SERVER_AGENTS, TEMPLATE_AGENTS } from "@/app/api/team/agentIds";

type Context = { params: Promise<{ agent: string }> };

// Save an agent's settings.
export async function PUT(request: Request, context: Context) {
  const { agent } = await context.params;
  if (!SERVER_AGENTS.includes(agent)) return agentNotFound();
  return proxyBackend(request, `/api/team/${agent}`);
}

// Remove an agent added from a template. Its settings, knowledge base and inbox stay.
export async function DELETE(request: Request, context: Context) {
  const { agent } = await context.params;
  if (!TEMPLATE_AGENTS.includes(agent)) return agentNotFound();
  return proxyBackend(request, `/api/team/${agent}`);
}
