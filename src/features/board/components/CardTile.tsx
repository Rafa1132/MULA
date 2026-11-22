"use client";

import type { Card } from "../types";
import { isStarting, statusLine } from "../services/columns";

/** One card in a column. The whole tile is a button that opens the card's panel. */
export default function CardTile({ card, onOpen }: { card: Card; onOpen: (card: Card) => void }) {
  let state = card.column as string;
  if (isStarting(card)) state = "starting";
  return <li>
    <button type="button" className="board-card" data-state={state} onClick={() => onOpen(card)}>
      <span className="board-card-title">{card.title}</span>
      <span className="board-card-status">{statusLine(card)}</span>
      {card.column === "todo" && card.notes && <span className="board-card-notes">{card.notes}</span>}
      {card.column === "done" && card.result && <span className="board-card-notes">{card.result}</span>}
    </button>
  </li>;
}
