import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
// The agent's A2A card (server/src/features/a2a), generated from its file.
export async function GET(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (!["operator", "forecasting"].includes(agent)) return Response.json({ detail: "Agent not found." }, { status: 404 });
  return proxyBackend(request, `/api/team/${agent}/card`);
}
