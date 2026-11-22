// Calls to /api/board. Every call carries the page's project (projectFetch); the server checks the
// account may open it and only ever opens that project's board.
import type { Board, Card, CardDetails, CardDraft } from "../types.ts";
import { projectFetch } from "../../../common/services/project.ts";

// The runtime's card ids, for example t_ae9b8693. Checked here so a bad id never builds a URL.
export const CARD_ID = /^t_[0-9a-f]{8,32}$/;

const FALLBACK = "The Board couldn't do that. Please try again.";

/** The server's own message when it sent one, else a readable fallback. */
export async function readError(response: Response): Promise<string> {
  if (response.status === 401) return "Your session expired. Sign in again.";
  try {
    const body = await response.json();
    if (typeof body.detail === "string" && body.detail !== "Not Found") return body.detail;
  } catch {
    // A proxy may answer with HTML; keep the fallback.
  }
  return FALLBACK;
}

async function request(path: string, init: RequestInit = {}) {
  const response = await projectFetch(path, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

function cardPath(cardId: string, action = "") {
  if (!CARD_ID.test(cardId)) throw new Error("That card isn't on this board.");
  return `/api/board/cards/${cardId}${action}`;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function loadBoard(signal?: AbortSignal): Promise<Board> {
  return (await request("/api/board", { signal })).json();
}

export async function loadCard(cardId: string, signal?: AbortSignal): Promise<CardDetails> {
  return (await request(cardPath(cardId), { signal })).json();
}

/** Trimmed title and notes; an empty agent choice means no agent. */
export function cleanDraft(draft: CardDraft): CardDraft {
  let agent = draft.agent;
  if (agent === "") agent = null;
  return { title: draft.title.trim(), notes: draft.notes.trim(), agent };
}

export async function addCard(draft: CardDraft): Promise<Card> {
  return (await request("/api/board/cards", json("POST", cleanDraft(draft)))).json();
}

export async function changeCard(cardId: string, draft: CardDraft): Promise<CardDetails> {
  return (await request(cardPath(cardId), json("PATCH", cleanDraft(draft)))).json();
}

export async function startCard(cardId: string): Promise<CardDetails> {
  return (await request(cardPath(cardId, "/start"), { method: "POST" })).json();
}

export async function sendBack(cardId: string): Promise<CardDetails> {
  return (await request(cardPath(cardId, "/back"), { method: "POST" })).json();
}

export async function markDone(cardId: string): Promise<CardDetails> {
  return (await request(cardPath(cardId, "/done"), { method: "POST" })).json();
}

export async function addComment(cardId: string, text: string): Promise<CardDetails> {
  return (await request(cardPath(cardId, "/comments"), json("POST", { text: text.trim() }))).json();
}

export async function archiveCard(cardId: string): Promise<void> {
  await request(cardPath(cardId, "/archive"), { method: "POST" });
}
