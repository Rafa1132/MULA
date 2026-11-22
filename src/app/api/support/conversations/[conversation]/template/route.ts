import { proxyConversation } from "../proxy";
import type { ConversationContext } from "../proxy";
// Send the connection's approved template: the allowed way back after 24 hours.
export async function POST(request: Request, context: ConversationContext) {
  return proxyConversation(request, context, "/template");
}
