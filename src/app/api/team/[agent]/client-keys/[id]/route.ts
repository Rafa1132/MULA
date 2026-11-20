import { proxyBackend } from "@/common/services/server-proxy";
// Revoke one client key. Key ids are UUIDs; anything else never reaches the backend.
export async function DELETE(request: Request, context: { params: Promise<{ agent: string; id: string }> }) {
  const { agent, id } = await context.params;
  if (!["operator", "forecasting"].includes(agent)) return Response.json({ detail: "Agent not found." }, { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ detail: "This key was not found." }, { status: 404 });
  return proxyBackend(request, `/api/team/${agent}/client-keys/${id}`);
}
