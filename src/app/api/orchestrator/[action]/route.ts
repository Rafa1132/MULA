import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function GET(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "profile" && action !== "conversation" && action !== "assistant") return new Response(null, { status: 404 });
  return proxyBackend(request, `/api/orchestrator/${action}`);
}
export async function PUT(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "profile" && action !== "personality" && action !== "assistant") return new Response(null, { status: 404 });
  return proxyBackend(request, `/api/orchestrator/${action}`);
}
export async function POST(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "chat") return new Response(null, { status: 404 });
  return proxyBackend(request, "/api/orchestrator/chat");
}
