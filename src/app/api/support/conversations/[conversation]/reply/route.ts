import { proxyConversation } from "../proxy";
import type { ConversationContext } from "../proxy";
// The owner's reply, sent on the customer's channel (only inside WhatsApp's 24-hour window).
export async function POST(request: Request, context: ConversationContext) {
  return proxyConversation(request, context, "/reply");
}
