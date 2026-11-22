import { proxyCard } from "../proxy";
import type { CardContext } from "../proxy";
// Add a comment to the card's thread.
export async function POST(request: Request, context: CardContext) {
  return proxyCard(request, context, "/comments");
}
