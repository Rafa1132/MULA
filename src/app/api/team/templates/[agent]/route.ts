import { proxyBackend } from "@/common/services/server-proxy";
import { agentNotFound, TEMPLATE_AGENTS } from "@/app/api/team/agentIds";
// Add a template agent (Customer Service) to this project, with the owner's edits from the Add agent form.
export async function POST(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (!TEMPLATE_AGENTS.includes(agent)) return agentNotFound();
  return proxyBackend(request, `/api/team/templates/${agent}`);
}
