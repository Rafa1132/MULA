import { proxyBackend } from "@/common/services/server-proxy";
import { SERVER_AGENTS } from "@/app/api/team/agentIds";
export const dynamic = "force-dynamic";
// The agent's A2A card (server/src/features/a2a), generated from its file.
export async function GET(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (!SERVER_AGENTS.includes(agent)) return Response.json({ detail: "Agent not found." }, { status: 404 });
  return proxyBackend(request, `/api/team/${agent}/card`);
}
