// Pure Board logic: grouping cards into columns, labels, and which actions a card offers. Kept free
// of React and fetch so it is unit tested (tests/columns.test.mjs).
import type { Card, Column } from "../types.ts";

export const COLUMN_ORDER: Column[] = ["todo", "working", "needs_you", "done"];

export const COLUMN_LABELS: Record<Column, string> = {
  todo: "To do",
  working: "Working",
  needs_you: "Needs you",
  done: "Done",
};

export const COLUMN_EMPTY: Record<Column, string> = {
  todo: "Add a card, choose an agent, then press Start.",
  working: "Nothing is being worked on.",
  needs_you: "No card is waiting for you.",
  done: "Finished cards appear here.",
};

export type ColumnGroup = { column: Column; label: string; cards: Card[] };

/** Every column in board order, each with its cards in the order the server sent them (newest first). */
export function groupByColumn(cards: Card[]): ColumnGroup[] {
  return COLUMN_ORDER.map((column) => ({
    column,
    label: COLUMN_LABELS[column],
    cards: cards.filter((card) => card.column === column),
  }));
}

/** "ready" means Start was pressed but no worker has picked the card up yet (up to one dispatcher tick). */
export function isStarting(card: Card): boolean {
  return card.column === "working" && card.status === "ready";
}

/** A short line under the card's title saying where it stands. */
export function statusLine(card: Card): string {
  if (card.column === "todo") {
    if (card.agent_name === null) return "No agent yet";
    return `Waits for Start · ${card.agent_name}`;
  }
  if (card.column === "working") {
    if (isStarting(card)) return `Starting · ${card.agent_name ?? "agent"}`;
    return `${card.agent_name ?? "An agent"} is working`;
  }
  if (card.column === "needs_you") {
    if (card.status === "review") return "Ready for your review";
    return "The agent has a question";
  }
  return "Done";
}

export type CardActions = {
  start: boolean;
  // "Continue" instead of "Start" for a card the agent sent back with a question.
  startLabel: "Start" | "Continue";
  sendBack: boolean;
  done: boolean;
  archive: boolean;
  edit: boolean;
};

/** Which buttons a card shows. The server enforces the same rules; this only hides what would be refused. */
export function actionsFor(card: Card): CardActions {
  const waiting = card.column === "todo" || card.column === "needs_you";
  let startLabel: CardActions["startLabel"] = "Start";
  if (card.column === "needs_you") startLabel = "Continue";
  return {
    start: waiting && card.agent !== null,
    startLabel,
    sendBack: isStarting(card),
    done: waiting,
    archive: card.column !== "working",
    edit: card.column !== "working",
  };
}

/** Poll only while something can change without the owner: a card in Working. */
export function needsPolling(cards: Card[]): boolean {
  return cards.some((card) => card.column === "working");
}

/** A runtime timestamp (seconds) as a short local date and time, or "". */
export function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "";
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
