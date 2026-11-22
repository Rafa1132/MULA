import { proxyCard } from "../proxy";
import type { CardContext } from "../proxy";
// Send back a started card that no agent has picked up yet.
export async function POST(request: Request, context: CardContext) {
  return proxyCard(request, context, "/back");
}
