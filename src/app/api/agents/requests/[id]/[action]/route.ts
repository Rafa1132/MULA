import { proxyBackend } from "@/common/services/server-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Request ids are UUIDs; checking the shape keeps arbitrary text out of the backend path.
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params;
  if (!REQUEST_ID.test(id) || !["approve", "decline"].includes(action)) {
    return Response.json({ detail: "Request not found." }, { status: 404 });
  }
  return proxyBackend(request, `/api/agents/requests/${id}/${action}`);
}
