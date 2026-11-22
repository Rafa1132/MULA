// Calls to /api/knowledge and the editor's rules. The limits mirror server/src/features/knowledge
// (EntryInput); the server checks them again, so these only give earlier, friendlier messages.
import type { EntryDraft, EntryErrors, KnowledgeEntry, KnowledgeKind } from "../types.ts";
import { projectFetch } from "../../../common/services/project.ts";
import { readError } from "../../../common/services/readError.ts";

export const KINDS: KnowledgeKind[] = ["product", "faq", "hours", "policy"];
export const KIND_LABELS: Record<KnowledgeKind, string> = { faq: "FAQ", product: "Products and services", hours: "Opening hours", policy: "Policies" };
export const KIND_HINTS: Record<KnowledgeKind, string> = {
  product: "What you sell, with its price. The agent never states a price that isn't here.",
  faq: "Questions customers often ask, with your answer.",
  hours: "When you're open, including holidays.",
  policy: "Delivery, returns, payment and other rules.",
};
export const TITLE_MAX = 200;
export const BODY_MAX = 4000;
export const PRICE_MAX = 60;
// Entries are server ids of 32 hex characters.
export const ENTRY_ID = /^[0-9a-f]{32}$/;

const FALLBACK = "The knowledge base couldn't do that. Please try again.";

export function emptyDraft(kind: KnowledgeKind = "product"): EntryDraft {
  return { kind, title: "", body: "", price: "" };
}

export function draftOf(entry: KnowledgeEntry): EntryDraft {
  return { kind: entry.kind, title: entry.title, body: entry.body, price: entry.price };
}

/** Trimmed fields; a price is kept only for products and services. */
export function cleanDraft(draft: EntryDraft): EntryDraft {
  let price = "";
  if (draft.kind === "product") price = draft.price.trim();
  return { kind: draft.kind, title: draft.title.trim(), body: draft.body.trim(), price };
}

export function validateEntry(draft: EntryDraft): EntryErrors {
  const errors: EntryErrors = {};
  const clean = cleanDraft(draft);
  if (!KINDS.includes(clean.kind)) errors.kind = "Choose what kind of entry this is.";
  if (!clean.title) errors.title = "Give the entry a title.";
  else if (clean.title.length > TITLE_MAX) errors.title = `Use at most ${TITLE_MAX} characters.`;
  if (!clean.body) errors.body = "Write what customers should be told.";
  else if (clean.body.length > BODY_MAX) errors.body = `Use at most ${BODY_MAX.toLocaleString("en")} characters.`;
  if (clean.price.length > PRICE_MAX) errors.price = `Use at most ${PRICE_MAX} characters.`;
  return errors;
}

/** Entries in KINDS order, every kind listed even when empty, so the page shows where to add. */
export function groupByKind(entries: KnowledgeEntry[]) {
  return KINDS.map((kind) => ({ kind, label: KIND_LABELS[kind], entries: entries.filter((entry) => entry.kind === kind) }));
}

async function request(path: string, init: RequestInit = {}) {
  const response = await projectFetch(path, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(await readError(response, FALLBACK));
  return response;
}

function entryPath(id: string) {
  if (!ENTRY_ID.test(id)) throw new Error("That entry isn't in this knowledge base.");
  return `/api/knowledge/${id}`;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function listEntries(signal?: AbortSignal): Promise<KnowledgeEntry[]> {
  const result = await (await request("/api/knowledge", { signal })).json();
  if (!result || !Array.isArray(result.entries)) throw new Error("The server sent a knowledge base Mula can't read.");
  return result.entries;
}

export async function addEntry(draft: EntryDraft): Promise<KnowledgeEntry> {
  return (await request("/api/knowledge", json("POST", cleanDraft(draft)))).json();
}

export async function changeEntry(id: string, draft: EntryDraft): Promise<KnowledgeEntry> {
  return (await request(entryPath(id), json("PATCH", cleanDraft(draft)))).json();
}

export async function removeEntry(id: string): Promise<void> {
  await request(entryPath(id), { method: "DELETE" });
}
