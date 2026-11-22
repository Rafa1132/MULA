import { proxyBackend } from "@/common/services/server-proxy";
import { agentNotFound, TEMPLATE_AGENTS } from "@/app/api/team/agentIds";
// Customer Service settings: tone, the WhatsApp switch and the allowlist.
export async function PUT(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (!TEMPLATE_AGENTS.includes(agent)) return agentNotFound();
  return proxyBackend(request, `/api/team/${agent}/support`);
}
