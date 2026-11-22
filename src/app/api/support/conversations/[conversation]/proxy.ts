import { proxyBackend } from "@/common/services/server-proxy";
import { RECORD_ID, recordNotFound } from "@/app/api/support/ids";

export type ConversationContext = { params: Promise<{ conversation: string }> };

/** Proxies one conversation's call; a malformed id never reaches the backend. */
export async function proxyConversation(request: Request, context: ConversationContext, action = "") {
  const { conversation } = await context.params;
  if (!RECORD_ID.test(conversation)) return recordNotFound("conversation");
  return proxyBackend(request, `/api/support/conversations/${conversation}${action}`);
}
