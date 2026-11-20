// Notes on the Memory page: API types and calls, the folder tree, `[[` completion and
// wikilink splitting for display. Notes are the Markdown files in the account's vault; the
// server reads and parses them, and the browser only reshapes what /api/memory/graph and
// /api/memory/notes/{id} return.

import { projectFetch } from "../../../common/services/project.ts";

export type Target = "business" | "owner";

export type GraphNode = {
  id: string;
  kind: "note" | "facts" | "ghost";
  title: string;
  folder: string | null;
  tags: string[];
  essential: boolean;
  updated_at: string | null;
  links: number;
  note_id?: number;
  target?: Target;
};
export type GraphEdge = { source: string; target: string; count: number };
// `folders`: every folder in the vault, empty ones too. `skipped`: files the server couldn't show, and why.
export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  tags: { tag: string; count: number }[];
  folders: string[];
  skipped: { path: string; reason: string }[];
};

export type Mention = { title: string; context: string; note_id?: number; folder?: string; fact_id?: number; target?: Target };
export type NoteDetail = {
  id: number;
  version: number;
  versions: number;
  folder: string;
  title: string;
  text: string;
  body: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  links: { target: string; alias: string | null; resolves_to: string | null }[];
  mentions: Mention[];
  created_at: string;
  updated_at: string;
  archived: boolean;
  // Why the file looks wrong (unreadable frontmatter, something like a password), or null.
  warning: string | null;
};
export type SaveResult = {
  outcome: "saved" | "unchanged";
  note: NoteDetail;
  renamed_from: { folder: string; title: string } | null;
  stale_links: number;
  stale_facts: number;
};
export type SearchHit =
  | { kind: "fact"; id: number; target: Target; fact: string; created_at: string }
  | { kind: "note"; note_id: number; title: string; folder: string; snippet: string };

// The Facts folder is generated from the fact store; these ids match the server's node ids.
export const FACTS_FOLDER = "Facts";
export const INSPECT_ID = "facts:inspect";

export class ConflictError extends Error {}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  let body: { detail?: unknown } = {};
  try {
    body = await response.json();
  } catch {
    if (!response.ok) throw new Error(fallback);
    throw new Error("The server sent an unreadable reply.");
  }
  if (!response.ok) {
    let message = fallback;
    if (typeof body.detail === "string") message = body.detail;
    if (response.status === 409) throw new ConflictError(message);
    throw new Error(message);
  }
  return body as T;
}

export async function fetchGraph() {
  return readJson<Graph>(await projectFetch("/api/memory/graph", { cache: "no-store" }), "Could not load your notes.");
}

export async function fetchNote(id: number) {
  return readJson<NoteDetail>(await projectFetch(`/api/memory/notes/${id}`, { cache: "no-store" }), "Could not open the note.");
}

export type Draft = { folder: string; title: string; text: string };

export async function saveNote(draft: Draft, existing: NoteDetail | null) {
  const json = { "Content-Type": "application/json" };
  if (existing === null) {
    return readJson<SaveResult>(await projectFetch("/api/memory/notes", { method: "POST", headers: json, body: JSON.stringify(draft) }), "Could not save the note.");
  }
  const body = JSON.stringify({ ...draft, base_version: existing.version });
  return readJson<SaveResult>(await projectFetch(`/api/memory/notes/${existing.id}`, { method: "PUT", headers: json, body }), "Could not save the note.");
}

export async function relinkNote(id: number, from: { folder: string; title: string }) {
  const body = JSON.stringify({ from_folder: from.folder, from_title: from.title });
  return readJson<{ updated: number; stale_facts: number }>(
    await projectFetch(`/api/memory/notes/${id}/relink`, { method: "POST", headers: { "Content-Type": "application/json" }, body }),
    "Could not update the links.");
}

/** A new, empty folder in the vault ('a/b' makes b inside a). */
export async function createFolder(folder: string) {
  return readJson<{ folder: string }>(
    await projectFetch("/api/memory/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder }) }),
    "Could not create the folder.");
}

export async function archiveNote(id: number) {
  return readJson<{ note_id: number }>(await projectFetch(`/api/memory/notes/${id}/archive`, { method: "POST" }), "Could not archive the note.");
}

export async function searchMemory(question: string) {
  const body = await readJson<{ results: SearchHit[] }>(
    await projectFetch("/api/memory/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }),
    "Search failed.");
  return body.results;
}

// ---- The folder tree ----

export type TreeFolder = { name: string; path: string; folders: TreeFolder[]; notes: GraphNode[]; count: number };

function byName(left: { name?: string; title?: string }, right: { name?: string; title?: string }) {
  const a = left.name ?? left.title ?? "";
  const b = right.name ?? right.title ?? "";
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

/**
 * Folders from note paths, alphabetical, with the generated Facts folder first and ghosts left out.
 * `folders` adds the vault's folders that hold no note (yet), so an empty folder shows too.
 */
export function buildTree(nodes: GraphNode[], folders: string[] = []): TreeFolder {
  const root: TreeFolder = { name: "", path: "", folders: [], notes: [], count: 0 };
  function folderAt(path: string) {
    let folder = root;
    let current = "";
    for (const part of path.split("/").filter(Boolean)) {
      if (current) current += "/" + part;
      else current = part;
      let child = folder.folders.find((candidate) => candidate.name === part);
      if (!child) {
        child = { name: part, path: current, folders: [], notes: [], count: 0 };
        folder.folders.push(child);
      }
      folder = child;
    }
    return folder;
  }
  for (const node of nodes) {
    if (node.kind === "ghost" || node.folder === null) continue;
    folderAt(node.folder).notes.push(node);
  }
  for (const path of folders) folderAt(path);
  const facts = root.folders.find((folder) => folder.path === FACTS_FOLDER);
  if (facts) facts.notes.push({ id: INSPECT_ID, kind: "facts", title: "What the Operator reads", folder: FACTS_FOLDER, tags: [], essential: false, updated_at: null, links: 0 });
  function finish(folder: TreeFolder): number {
    folder.folders.sort(byName);
    if (folder.path !== FACTS_FOLDER) folder.notes.sort(byName);
    folder.count = folder.notes.filter((note) => note.id !== INSPECT_ID).length;
    for (const child of folder.folders) folder.count += finish(child);
    return folder.count;
  }
  finish(root);
  if (facts) root.folders = [facts, ...root.folders.filter((folder) => folder !== facts)];
  return root;
}

// A name being typed into the tree for a new note or folder, inside `folder` ('' is the top level).
export type TreeDraft = { kind: "note" | "folder"; folder: string };
export const DRAFT_ROW_ID = "draft";

export type TreeRow =
  | { kind: "folder"; id: string; level: number; folder: TreeFolder; expanded: boolean; parent: string | null; size: number; position: number }
  | { kind: "note"; id: string; level: number; node: GraphNode; parent: string | null; size: number; position: number }
  | { kind: "draft"; id: string; level: number; draft: TreeDraft; parent: string | null; size: number; position: number };

export function folderRowId(path: string) {
  return "folder:" + path;
}

/**
 * The rows a screen reader and the arrow keys walk through: expanded folders show their contents.
 * A draft (a name being typed for a new note or folder) comes first in its folder, as in Obsidian;
 * the caller opens that folder.
 */
export function visibleRows(root: TreeFolder, expanded: Set<string>, tagFilter: string | null = null, draft: TreeDraft | null = null): TreeRow[] {
  const rows: TreeRow[] = [];
  function walk(folder: TreeFolder, level: number, parent: string | null) {
    const folders = folder.folders.filter((child) => tagFilter === null || hasTag(child, tagFilter));
    const notes = folder.notes.filter((note) => tagFilter === null || note.tags.some((tag) => sameTag(tag, tagFilter)));
    let size = folders.length + notes.length;
    let position = 0;
    if (draft !== null && draft.folder === folder.path) {
      size += 1;
      position += 1;
      rows.push({ kind: "draft", id: DRAFT_ROW_ID, level, draft, parent, size, position });
    }
    for (const child of folders) {
      position += 1;
      // A tag filter opens every folder that holds a match, so matches are never hidden.
      const open = expanded.has(child.path) || tagFilter !== null;
      rows.push({ kind: "folder", id: folderRowId(child.path), level, folder: child, expanded: open, parent, size, position });
      if (open) walk(child, level + 1, folderRowId(child.path));
    }
    for (const note of notes) {
      position += 1;
      rows.push({ kind: "note", id: note.id, level, node: note, parent, size, position });
    }
  }
  walk(root, 1, null);
  return rows;
}

export function sameTag(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function hasTag(folder: TreeFolder, tag: string): boolean {
  return folder.notes.some((note) => note.tags.some((each) => sameTag(each, tag))) || folder.folders.some((child) => hasTag(child, tag));
}

// The same characters the server refuses in titles and folder names (notes.py, TITLE_FORBIDDEN).
const NAME_FORBIDDEN = new Set('/\\:*?"<>|[]#^');
export const MAX_NAME = 120;
export const MAX_FOLDER_DEPTH = 8;

/** Why a note title or folder name would be refused, or null when it is fine. Mirrors notes.check_name. */
export function nameProblem(name: string, what: "title" | "folder name"): string | null {
  const clean = name.split(/\s+/).filter(Boolean).join(" ");
  if (!clean) return `Give it a ${what}.`;
  if (clean.length > MAX_NAME) return `A ${what} can have at most ${MAX_NAME} characters.`;
  if (clean.startsWith(".") || clean.endsWith(".")) return `A ${what} can't start or end with a dot.`;
  for (const character of clean) {
    if (NAME_FORBIDDEN.has(character)) return `A ${what} can't contain ${character}. These characters break links and file names: / \\ : * ? " < > | [ ] # ^`;
  }
  return null;
}

/** "Untitled", or "Untitled 1", "Untitled 2"… when taken in that folder, compared without regard to case, like Obsidian. */
export function untitledName(taken: string[], base = "Untitled") {
  const used = new Set(taken.map(titleKey));
  if (!used.has(titleKey(base))) return base;
  let number = 1;
  while (used.has(titleKey(`${base} ${number}`))) number += 1;
  return `${base} ${number}`;
}

/** The folder path inside `parent` ('' is the top level). */
export function childPath(parent: string, name: string) {
  if (!parent) return name;
  return `${parent}/${name}`;
}

/** Every folder path, for the editor's folder suggestions; the generated Facts folder is not one. */
export function folderPaths(nodes: GraphNode[]) {
  const paths = new Set<string>();
  for (const node of nodes) {
    if (node.kind !== "note" || !node.folder) continue;
    const parts = node.folder.split("/");
    for (let index = 1; index <= parts.length; index += 1) paths.add(parts.slice(0, index).join("/"));
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

// ---- `[[` completion in the editor ----

/** The link being typed at the caret: the text after an unclosed `[[` on the same line, before any `|` or `#`. */
export function linkQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  const typed = before.slice(open + 2);
  if (/[\]\n|#^[]/.test(typed)) return null;
  return { start: open + 2, query: typed };
}

/** The text with the typed query replaced by `title]]`, and where the caret goes after it. */
export function completeLink(text: string, start: number, caret: number, title: string) {
  let after = text.slice(caret);
  // If the closing brackets are already there, reuse them.
  if (after.startsWith("]]")) after = after.slice(2);
  const inserted = title + "]]";
  return { text: text.slice(0, start) + inserted + after, caret: start + inserted.length };
}

/** Titles that start with the query first, then titles that contain it. Ghosts are not suggested. */
export function matchTitles(nodes: GraphNode[], query: string, limit = 8) {
  const wanted = query.trim().toLocaleLowerCase();
  const titles = nodes.filter((node) => node.kind !== "ghost" && node.id !== INSPECT_ID).map((node) => node.title);
  const starts = titles.filter((title) => title.toLocaleLowerCase().startsWith(wanted));
  const contains = titles.filter((title) => !title.toLocaleLowerCase().startsWith(wanted) && title.toLocaleLowerCase().includes(wanted));
  return [...starts.sort(byTitle), ...contains.sort(byTitle)].slice(0, limit);
}

function byTitle(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

// ---- Resolving links in the browser ----

/** The server's comparison form (notes.key): spaces collapsed, Unicode-normalized, case-insensitive. */
export function titleKey(text: string) {
  return text.split(/\s+/).filter(Boolean).join(" ").normalize("NFC").toLocaleLowerCase();
}

export function ghostId(target: string) {
  return "ghost:" + titleKey(target);
}

/** A link target's node id from the graph: a path when it names a folder, otherwise a title. Null for a ghost. */
export function resolveTarget(nodes: GraphNode[], target: string): string | null {
  const wanted = titleKey(target);
  for (const node of nodes) {
    if (node.kind === "ghost") continue;
    if (target.includes("/")) {
      if (node.kind === "note" && node.folder && titleKey(node.folder + "/" + node.title) === wanted) return node.id;
    } else if (titleKey(node.title) === wanted) {
      return node.id;
    }
  }
  return null;
}

// ---- Wikilinks and tags in rendered text ----

export type TextPart = { text: string } | { link: string; label: string } | { tag: string };

// Same grammar as the server's parser (memory/notes.py): links, then tags after whitespace.
const INLINE = /!?\[\[([^[\]\n]+?)\]\]|(?<=^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

export function linkTarget(inner: string) {
  let target = inner;
  let alias: string | null = null;
  const bar = inner.indexOf("|");
  if (bar !== -1) {
    target = inner.slice(0, bar);
    alias = inner.slice(bar + 1).trim() || null;
  }
  target = target.split("#")[0].split("^")[0].trim();
  if (target.toLowerCase().endsWith(".md")) target = target.slice(0, -3).trim();
  return { target, alias };
}

/** A plain text run split into text, wikilinks (with their display label) and #tags. */
export function splitInline(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    if (match[1] !== undefined) {
      const { target, alias } = linkTarget(match[1]);
      let label = alias ?? match[1].split("|")[0].trim();
      if (!label) label = target;
      if (target) parts.push({ link: target, label });
      else parts.push({ text: match[0] });
    } else {
      parts.push({ tag: match[2] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
