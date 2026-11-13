import { proxyBackend } from "@/common/services/server-proxy";
export async function PUT(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (!["operator", "forecasting"].includes(agent)) return Response.json({ detail: "Agent not found." }, { status: 404 });
  return proxyBackend(request, `/api/team/${agent}`);
}
