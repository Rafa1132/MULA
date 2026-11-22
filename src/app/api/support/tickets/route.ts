import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
// The inbox: open (default) or resolved handoff tickets.
export async function GET(request: Request) {
  let status = "open";
  if (new URL(request.url).searchParams.get("status") === "resolved") status = "resolved";
  return proxyBackend(request, `/api/support/tickets?status=${status}`);
}
