import { proxyBackend } from "@/common/services/server-proxy";
// The project's Board: its columns, cards and the agents a card can be given.
export async function GET(request: Request) {
  return proxyBackend(request, "/api/board");
}
