import { proxyBackend } from "@/common/services/server-proxy";
// A static route, so "layout" never reaches the [agent] settings route.
export async function PUT(request: Request) {
  return proxyBackend(request, "/api/team/layout");
}
export async function DELETE(request: Request) {
  return proxyBackend(request, "/api/team/layout");
}
