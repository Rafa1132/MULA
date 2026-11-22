import { proxyCard } from "../proxy";
import type { CardContext } from "../proxy";
// Archive the card: it leaves the Board.
export async function POST(request: Request, context: CardContext) {
  return proxyCard(request, context, "/archive");
}
