import { proxyBackend } from "@/common/services/server-proxy";
import { isProjectId } from "@/common/services/project";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ projectId: string }> };
export async function PATCH(request: Request, context: Context) {
  const { projectId } = await context.params;
  // Only a well-formed id reaches the server's path; it still checks that the account owns it.
  if (!isProjectId(projectId)) return Response.json({ detail: "This project wasn't found." }, { status: 404 });
  return proxyBackend(request, `/api/projects/${projectId}`);
}
