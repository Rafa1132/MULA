import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
const ACTIONS = ["answer", "skip", "skip-all", "summary", "personality", "restart", "welcome"];
export async function POST(request: Request, context: Context) {
  const { action } = await context.params;
  if (!ACTIONS.includes(action)) return new Response(null, { status: 404 });
  return proxyBackend(request, `/api/onboarding/${action}`);
}
