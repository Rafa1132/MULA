import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function PUT(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "document") return new Response(null, { status: 404 });
  return proxyBackend(request, "/api/memory/document");
}
export async function POST(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "search") return new Response(null, { status: 404 });
  return proxyBackend(request, "/api/memory/search");
}
