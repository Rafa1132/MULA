import { proxyBackend } from "@/common/services/server-proxy";
import { isProjectId } from "@/common/services/project";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; action: string }> };
// Create or dismiss a project the assistant proposed. Proposal ids are UUIDs, like project ids.
export async function POST(request: Request, context: Context) {
  const { id, action } = await context.params;
  if (!isProjectId(id) || (action !== "confirm" && action !== "decline")) return new Response(null, { status: 404 });
  return proxyBackend(request, `/api/orchestrator/proposals/${id}/${action}`);
}
