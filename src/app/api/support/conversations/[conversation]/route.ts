import { proxyConversation } from "./proxy";
import type { ConversationContext } from "./proxy";
export const dynamic = "force-dynamic";
// One customer conversation with its messages and tickets.
export async function GET(request: Request, context: ConversationContext) {
  return proxyConversation(request, context);
}
