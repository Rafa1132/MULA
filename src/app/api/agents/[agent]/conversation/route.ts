import { proxyBackend } from "@/common/services/server-proxy";
import { DIRECT_CHAT_AGENTS } from "@/app/api/team/agentIds";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (!DIRECT_CHAT_AGENTS.includes(agent)) return Response.json({ detail: "Agent not found." }, { status: 404 });
  return proxyBackend(request, `/api/agents/${agent}/conversation`);
}
