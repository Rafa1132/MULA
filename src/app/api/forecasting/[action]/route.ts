import { proxyBackend } from "@/common/services/server-proxy";
type Context = { params: Promise<{ action: string }> };
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: Context) {
  const { action } = await context.params;
  if (!["preview", "run", "explain"].includes(action)) return Response.json({ detail: "Action not found." }, { status: 404 });
  return proxyBackend(request, `/api/forecasting/${action}`);
}
export async function GET(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "latest") return Response.json({ detail: "Action not found." }, { status: 404 });
  return proxyBackend(request, "/api/forecasting/latest");
}
