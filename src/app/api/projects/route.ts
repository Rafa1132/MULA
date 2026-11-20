import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return proxyBackend(request, "/api/projects");
}
export async function POST(request: Request) {
  return proxyBackend(request, "/api/projects");
}
