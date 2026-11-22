// The handoff inbox (server/src/features/support): tickets the Customer Service agent opened, and the
// customer conversations behind them.

export type TicketStatus = "open" | "resolved";

export type Ticket = {
  id: string;
  conversation_id: string;
  reason: string;
  summary: string;
  status: TicketStatus;
  created_at: number;
  resolved_at: number | null;
  contact: string;
  contact_name: string;
  channel: "whatsapp";
};

export type SupportMessage = {
  id: number;
  direction: "in" | "out";
  author: "customer" | "agent" | "owner" | "system";
  body: string;
  // received, sending, sent, delivered, read or failed.
  status: string;
  error: string;
  created_at: number;
};

export type Conversation = {
  id: string;
  channel: "whatsapp";
  contact: string;
  contact_name: string;
  // human: a ticket is open and the agent stays quiet; agent: the agent answers.
  mode: "agent" | "human";
  opted_out: boolean;
  summary: string;
  last_inbound_at: number | null;
  in_window: boolean;
  window_ends_at: number;
  messages: SupportMessage[];
  tickets: Ticket[];
};
