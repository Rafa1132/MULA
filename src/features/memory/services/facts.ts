// Facts: the one-line memories the Operator and the owner save. They show as the two notes in the
// Facts folder; their API is unchanged from the earlier Memory page.
import type { Target } from "./notes.ts";
import { projectFetch } from "../../../common/services/project.ts";

export type Entry = {
  id: number; target: Target; fact: string; actor: string; created_at: string;
  superseded: boolean; superseded_by: number | null; superseded_at: string | null; superseded_reason: string | null;
  related: number[];
};
export type Audit = { id: number; action: string; entry_id: number | null; actor: string; occurred_at: string; detail?: { note_id?: number } };
export type Overview = {
  summary: string;
  entries: Entry[];
  audit: Audit[];
  last_retrieval: { question: string; occurred_at: string; entries: Entry[] } | null;
  relative_root: string;
};

// "vault": a change Mula found in the notes folder, made in Obsidian or by hand.
export const ACTORS: Record<string, string> = { operator: "Saved by the Operator", owner: "Saved by you", migration: "Imported", vault: "Found in the vault" };

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || fallback);
  return body as T;
}

export async function fetchOverview() {
  return readJson<Overview>(await projectFetch("/api/memory", { cache: "no-store" }), "Could not open memory.");
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function addFact(target: Target, fact: string) {
  return readJson<{ outcome: "saved" | "duplicate"; entry: Entry }>(
    await projectFetch("/api/memory/entries", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ target, fact }) }), "Could not save the memory.");
}

export async function correctFact(id: number, fact: string) {
  return readJson<{ outcome: string; entry: Entry }>(
    await projectFetch(`/api/memory/entries/${id}/supersede`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ fact }) }), "Could not correct the memory.");
}

export async function retireFact(id: number) {
  return readJson<{ entry: Entry }>(await projectFetch(`/api/memory/entries/${id}/retire`, { method: "POST" }), "Could not retire the memory.");
}
