import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return proxyBackend(request, "/api/project");
}
