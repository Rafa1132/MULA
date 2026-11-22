import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
// The project's knowledge base: the only facts Customer Service answers from.
export async function GET(request: Request) {
  return proxyBackend(request, "/api/knowledge");
}
export async function POST(request: Request) {
  return proxyBackend(request, "/api/knowledge");
}
