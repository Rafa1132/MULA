import { proxyBackend } from "@/common/services/server-proxy";
// Ask Meta whether the stored token can use the number. No message is sent.
export async function POST(request: Request) {
  return proxyBackend(request, "/api/channels/whatsapp/check");
}
