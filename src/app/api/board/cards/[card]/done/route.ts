import { proxyCard } from "../proxy";
import type { CardContext } from "../proxy";
// Mark a waiting card done without running an agent.
export async function POST(request: Request, context: CardContext) {
  return proxyCard(request, context, "/done");
}
