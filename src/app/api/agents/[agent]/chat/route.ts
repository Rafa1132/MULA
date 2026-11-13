import { proxyBackend } from "@/common/services/server-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The Operator's own chat is /api/chat; other agents are chatted with from My agents.
export async function POST(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (agent !== "forecasting") return Response.json({ detail: "Agent not found." }, { status: 404 });
  return proxyBackend(request, `/api/agents/${agent}/chat`);
}
