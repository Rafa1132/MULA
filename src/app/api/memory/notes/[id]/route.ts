import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function forward(request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^\d{1,12}$/.test(id)) return new Response(null, { status: 404 });
  return proxyBackend(request, `/api/memory/notes/${id}`);
}
export async function GET(request: Request, context: Context) {
  return forward(request, context);
}
export async function PUT(request: Request, context: Context) {
  return forward(request, context);
}
