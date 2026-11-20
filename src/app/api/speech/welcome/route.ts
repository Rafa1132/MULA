import { proxyBackend } from "@/common/services/server-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The spoken welcome for new accounts: fixed audio, made once on the server.
export async function GET(request: Request) {
  return proxyBackend(request, "/api/speech/welcome");
}
