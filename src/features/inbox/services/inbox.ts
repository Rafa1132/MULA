// Calls to /api/support and the inbox's rules. Every call carries the page's project (projectFetch);
// the server only ever opens that project's tickets and conversations.
import type { Conversation, SupportMessage, Ticket, TicketStatus } from "../types.ts";
import { projectFetch } from "../../../common/services/project.ts";
import { readError } from "../../../common/services/readError.ts";

// The server's ids: 32 hex characters. Checked so a bad id never builds a URL.
export const RECORD_ID = /^[0-9a-f]{32}$/;
// The same limit as the server's Reply model (support.REPLY_MAX).
export const REPLY_MAX = 1500;

const FALLBACK = "The inbox couldn't do that. Please try again.";

export const AUTHOR_LABELS: Record<SupportMessage["author"], string> = {
  customer: "Customer", agent: "Customer Service", owner: "You", system: "Mula",
};

/** What the reply area offers for this conversation, and why. */
export type ReplyState =
  | { kind: "reply" }
  | { kind: "template"; reason: string }
  | { kind: "blocked"; reason: string };

export function replyState(conversation: Pick<Conversation, "opted_out" | "in_window">): ReplyState {
  if (conversation.opted_out) {
    return { kind: "blocked", reason: "This customer sent STOP. Mula won't message them until they write START." };
  }
  if (!conversation.in_window) {
    return { kind: "template", reason: "The customer's last message is more than 24 hours old, so WhatsApp only allows an approved template until they write again." };
  }
  return { kind: "reply" };
}

/** "Budi (+6281…)" or just the number, for the list and the panel heading. */
export function contactLabel(ticket: Pick<Ticket, "contact" | "contact_name">) {
  const number = `+${ticket.contact}`;
  if (ticket.contact_name.trim()) return `${ticket.contact_name.trim()} (${number})`;
  return number;
}

/** Hours left in the 24-hour window, for the hint under the reply box; null once it closed. */
export function hoursLeft(conversation: Pick<Conversation, "window_ends_at" | "in_window">, nowSeconds: number) {
  if (!conversation.in_window) return null;
  return Math.max(0, Math.floor((conversation.window_ends_at - nowSeconds) / 3600));
}

export function messageStatus(message: SupportMessage) {
  if (message.direction === "in") return "";
  if (message.status === "failed") {
    let text = "Not delivered";
    if (message.error) text += `: ${message.error}`;
    return text;
  }
  if (message.status === "sending") return "Sending…";
  return message.status.charAt(0).toUpperCase() + message.status.slice(1);
}

async function request(path: string, init: RequestInit = {}) {
  const response = await projectFetch(path, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(await readError(response, FALLBACK));
  return response;
}

function idPath(prefix: string, id: string, action = "") {
  if (!RECORD_ID.test(id)) throw new Error("That isn't in this inbox.");
  return `${prefix}/${id}${action}`;
}

export async function listTickets(status: TicketStatus, signal?: AbortSignal): Promise<Ticket[]> {
  const result = await (await request(`/api/support/tickets?status=${status}`, { signal })).json();
  if (!result || !Array.isArray(result.tickets)) throw new Error("The server sent an inbox Mula can't read.");
  return result.tickets;
}

export async function loadConversation(id: string, signal?: AbortSignal): Promise<Conversation> {
  return (await request(idPath("/api/support/conversations", id), { signal })).json();
}

export async function sendReply(id: string, text: string): Promise<Conversation> {
  const body = JSON.stringify({ text: text.trim() });
  return (await request(idPath("/api/support/conversations", id, "/reply"), { method: "POST", headers: { "Content-Type": "application/json" }, body })).json();
}

export async function sendTemplate(id: string): Promise<Conversation> {
  return (await request(idPath("/api/support/conversations", id, "/template"), { method: "POST" })).json();
}

export async function resolveTicket(id: string): Promise<Conversation> {
  return (await request(idPath("/api/support/tickets", id, "/resolve"), { method: "POST" })).json();
}
