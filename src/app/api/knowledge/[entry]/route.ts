import { proxyBackend } from "@/common/services/server-proxy";
import { RECORD_ID, recordNotFound } from "@/app/api/support/ids";

type Context = { params: Promise<{ entry: string }> };

async function forward(request: Request, context: Context) {
  const { entry } = await context.params;
  if (!RECORD_ID.test(entry)) return recordNotFound("entry");
  return proxyBackend(request, `/api/knowledge/${entry}`);
}

// Change or remove one entry.
export const PATCH = forward;
export const DELETE = forward;
