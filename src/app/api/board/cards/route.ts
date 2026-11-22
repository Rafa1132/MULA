import { proxyBackend } from "@/common/services/server-proxy";
// Add a card. It is always parked in To do; nothing runs until someone presses Start.
export async function POST(request: Request) {
  return proxyBackend(request, "/api/board/cards");
}
