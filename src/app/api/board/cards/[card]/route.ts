import { proxyCard } from "./proxy";
import type { CardContext } from "./proxy";
// One card with its comments and runs; PATCH changes its title, notes or agent.
export async function GET(request: Request, context: CardContext) {
  return proxyCard(request, context);
}
export async function PATCH(request: Request, context: CardContext) {
  return proxyCard(request, context);
}
