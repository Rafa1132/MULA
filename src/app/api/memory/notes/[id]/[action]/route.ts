import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(request: Request, context: Context) {
  const { id, action } = await context.params;
  if (!/^\d{1,12}$/.test(id) || (action !== "relink" && action !== "archive")) return new Response(null, { status: 404 });
  return proxyBackend(request, `/api/memory/notes/${id}/${action}`);
}
