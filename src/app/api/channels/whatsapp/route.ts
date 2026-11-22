import { proxyBackend } from "@/common/services/server-proxy";
export const dynamic = "force-dynamic";
// The project's WhatsApp connection: status (secrets shown only as "set"), connect, disconnect.
// Meta's webhook does not come through here: it reaches the backend directly at
// /api/channels/whatsapp/webhook/<id> through the public HTTPS address.
export async function GET(request: Request) {
  return proxyBackend(request, "/api/channels/whatsapp");
}
export async function PUT(request: Request) {
  return proxyBackend(request, "/api/channels/whatsapp");
}
export async function DELETE(request: Request) {
  return proxyBackend(request, "/api/channels/whatsapp");
}
