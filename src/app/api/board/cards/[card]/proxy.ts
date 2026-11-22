import { proxyBackend } from "@/common/services/server-proxy";
import { CARD_ID } from "@/features/board/services/board";

export type CardContext = { params: Promise<{ card: string }> };

/** Proxies one card's call. Card ids are the runtime's (t_ + hex); anything else never reaches the backend. */
export async function proxyCard(request: Request, context: CardContext, action = "") {
  const { card } = await context.params;
  if (!CARD_ID.test(card)) return Response.json({ detail: "That card isn't on this board." }, { status: 404 });
  return proxyBackend(request, `/api/board/cards/${card}${action}`);
}
