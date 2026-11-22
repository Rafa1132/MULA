import { proxyBackend } from "@/common/services/server-proxy";
import { SERVER_AGENTS } from "@/app/api/team/agentIds";
export const dynamic = "force-dynamic";
// The agent's client keys for Agent Client Protocol clients (server/src/features/acp).
async function forward(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (!SERVER_AGENTS.includes(agent)) return Response.json({ detail: "Agent not found." }, { status: 404 });
  return proxyBackend(request, `/api/team/${agent}/client-keys`);
}
export const GET = forward;
export const POST = forward;
