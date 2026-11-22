import { proxyCard } from "../proxy";
import type { CardContext } from "../proxy";
// Start (or Continue): the card's agent works on it with its brain. This is the only call that runs an agent.
export async function POST(request: Request, context: CardContext) {
  return proxyCard(request, context, "/start");
}
