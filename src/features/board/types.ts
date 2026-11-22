// The shapes /api/board sends (server/src/features/board/service.py).

export type Column = "todo" | "working" | "needs_you" | "done";

export type Card = {
  id: string;
  title: string;
  notes: string;
  column: Column;
  // The runtime's own status, for example "ready" (Start pressed, not picked up yet) or "running".
  status: string;
  agent: string | null;
  agent_name: string | null;
  created_by: string;
  created_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  result: string;
  last_error: string;
};

export type CardComment = { author: string; body: string; created_at: number | null };

export type CardRun = {
  status: string | null;
  outcome: string | null;
  summary: string;
  error: string;
  started_at: number | null;
  ended_at: number | null;
};

export type CardDetails = Card & { comments: CardComment[]; runs: CardRun[]; latest_summary: string };

export type BoardAgent = { id: string; name: string };

export type Board = { columns: Column[]; cards: Card[]; agents: BoardAgent[] };

export type CardDraft = { title: string; notes: string; agent: string | null };
