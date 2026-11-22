import { proxyBackend } from "@/common/services/server-proxy";
import { RECORD_ID, recordNotFound } from "@/app/api/support/ids";
// Resolve a ticket: the conversation goes back to the agent.
export async function POST(request: Request, context: { params: Promise<{ ticket: string }> }) {
  const { ticket } = await context.params;
  if (!RECORD_ID.test(ticket)) return recordNotFound("ticket");
  return proxyBackend(request, `/api/support/tickets/${ticket}/resolve`);
}
