import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ agent: string }> }) {
  const { agent } = await context.params;
  if (agent !== "forecasting") return Response.json({ detail: "Agent not found." }, { status: 404 });
  return proxyBackend(request, `/api/agents/${agent}/conversation`);
}
