"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/common/components";
import { Overview } from "../services/facts";
import {
  ConflictError, Draft, FACTS_FOLDER, Graph, INSPECT_ID, MAX_FOLDER_DEPTH, Mention, NoteDetail, SearchHit, Target, TreeDraft, TreeFolder,
  archiveNote, buildTree, childPath, createFolder, fetchNote, folderPaths, ghostId, nameProblem, relinkNote, resolveTarget, saveNote, searchMemory, titleKey, untitledName,
} from "../services/notes";
import FactsNote from "./FactsNote";
import FolderTree from "./FolderTree";
import InspectPanel from "./InspectPanel";
import NoteEditor from "./NoteEditor";
import NoteView, { GhostView } from "./NoteView";

type Props = {
  graph: Graph;
  overview: Overview;
  selected: string | null;
  onSelect: (nodeId: string | null) => void;
  busy: boolean;
  run: (action: () => Promise<string>) => void;
  onError: (message: string) => void;
};

// focusText: put the caret in the text, for a note just made from the tree.
type Editing = { isNew: boolean; initial: Draft; focusText?: boolean };
type RelinkOffer = { noteId: number; from: { folder: string; title: string }; count: number };

function noteNumber(nodeId: string | null) {
  if (!nodeId || !nodeId.startsWith("note:")) return null;
  return Number(nodeId.slice("note:".length));
}

function plural(count: number, noun: string) {
  if (count === 1) return `1 ${noun}`;
  return `${count} ${noun}s`;
}

function findFolder(root: TreeFolder, path: string): TreeFolder | null {
  if (path === root.path) return root;
  for (const child of root.folders) {
    if (path === child.path || path.startsWith(child.path + "/")) return findFolder(child, path);
  }
  return null;
}

/** The folder and each folder above it, so all of them can be opened. */
function withAncestors(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function inFacts(path: string) {
  return path.split("/")[0] === FACTS_FOLDER;
}

function stillLink(count: number) {
  if (count === 1) return "1 note still links";
  return `${count} notes still link`;
}

/** The default Memory view: folders and search on the left, the selected note on the right. */
export default function FoldersView({ graph, overview, selected, onSelect, busy, run, onError }: Props) {
  const tree = useMemo(() => buildTree(graph.nodes, graph.folders), [graph]);
  const folders = useMemo(() => folderPaths(graph.nodes), [graph]);
  // Folders start open; the owner's closed ones are remembered for this visit.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const expanded = useMemo(() => {
    const open = new Set<string>();
    function walk(folder: typeof tree) {
      for (const child of folder.folders) {
        if (!collapsed.has(child.path)) open.add(child.path);
        walk(child);
      }
    }
    walk(tree);
    return open;
  }, [tree, collapsed]);
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [noteError, setNoteError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [conflict, setConflict] = useState(false);
  const [relinkOffer, setRelinkOffer] = useState<RelinkOffer | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Obsidian-style creation: the folder last clicked, and the name being typed into the tree.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [draft, setDraft] = useState<TreeDraft | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftError, setDraftError] = useState("");
  const drawerButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const selectedNote = noteNumber(selected);

  useEffect(() => {
    if (selectedNote === null) {
      setDetail(null);
      return;
    }
    let current = true;
    setNoteError("");
    fetchNote(selectedNote)
      .then((note) => { if (current) setDetail(note); })
      .catch((failure: Error) => { if (current) setNoteError(failure.message); });
    return () => { current = false; };
  }, [selectedNote, graph]);

  useEffect(() => {
    // A name being typed in the tree keeps the focus.
    if (drawerOpen && draft === null) searchInput.current?.focus();
  }, [drawerOpen]);


  function closeDrawer() {
    if (!drawerOpen) return;
    setDrawerOpen(false);
    drawerButton.current?.focus();
  }

  function open(nodeId: string | null, factId: number | null = null) {
    setActiveFolder(null);
    setEditing(null);
    setConflict(false);
    setHighlight(factId);
    onSelect(nodeId);
    closeDrawer();
  }

  function resolve(target: string) {
    return resolveTarget(graph.nodes, target);
  }

  function startNew(title = "", folder = "") {
    setConflict(false);
    setEditing({ isNew: true, initial: { folder, title, text: "" } });
    closeDrawer();
  }

  /** Where New note and New folder put things: the folder last clicked, else the open note's folder. */
  function targetFolder() {
    let folder = "";
    if (activeFolder !== null) folder = activeFolder;
    else if (detail && detail.id === selectedNote) folder = detail.folder;
    if (inFacts(folder)) return "";
    return folder;
  }

  /** Start typing a name for a new note or folder inside `folder`, as Obsidian does. */
  function newItem(kind: TreeDraft["kind"], folder = targetFolder()) {
    // Names only need to differ within the folder, as file names do.
    const here = findFolder(tree, folder);
    let taken = (here?.notes ?? []).map((note) => note.title);
    if (kind === "folder") taken = (here?.folders ?? []).map((child) => child.name);
    setHits(null);
    setQuery("");
    setTagFilter(null);
    setCollapsed((current) => {
      const next = new Set(current);
      for (const path of withAncestors(folder)) next.delete(path);
      return next;
    });
    setDraftName(untitledName(taken));
    setDraftError("");
    setDraft({ kind, folder });
    setDrawerOpen(true);
  }

  function cancelDraft() {
    setDraft(null);
    setDraftError("");
  }

  function commitFolder(parent: string, name: string) {
    const path = childPath(parent, name);
    if (path.split("/").length > MAX_FOLDER_DEPTH) {
      setDraftError(`Folders can be at most ${MAX_FOLDER_DEPTH} levels deep.`);
      return;
    }
    if (inFacts(path)) {
      setDraftError("The Facts folder is made from your saved facts. Choose another name.");
      return;
    }
    const siblings = (findFolder(tree, parent)?.folders ?? []).map((child) => titleKey(child.name));
    if (siblings.includes(titleKey(name))) {
      setDraftError(`A folder called “${name}” is already here.`);
      return;
    }
    run(async () => {
      try {
        await createFolder(path);
      } catch (failure) {
        // Shown beside the name, which stays open for another try.
        if (failure instanceof Error) setDraftError(failure.message);
        return "";
      }
      setActiveFolder(path);
      cancelDraft();
      return `Created the folder “${name}”.`;
    });
  }

  /** A new note is created at once, empty, and opens in the editor with the caret in its text. */
  function commitNote(folder: string, title: string) {
    run(async () => {
      let result;
      try {
        result = await saveNote({ folder, title, text: "" }, null);
      } catch (failure) {
        // Shown beside the name, which stays open for another try (a taken title, for example).
        if (failure instanceof Error) setDraftError(failure.message);
        return "";
      }
      cancelDraft();
      setActiveFolder(null);
      setDetail(result.note);
      onSelect("note:" + result.note.id);
      setEditing({ isNew: false, initial: { folder: result.note.folder, title: result.note.title, text: result.note.text }, focusText: true });
      setDrawerOpen(false);
      return `Created “${result.note.title}”.`;
    });
  }

  function commitDraft(typed: string) {
    if (!draft) return;
    const name = typed.split(/\s+/).filter(Boolean).join(" ");
    let what: "title" | "folder name" = "title";
    if (draft.kind === "folder") what = "folder name";
    const problem = nameProblem(name, what);
    if (problem) {
      setDraftError(problem);
      return;
    }
    if (draft.kind === "folder") commitFolder(draft.folder, name);
    else commitNote(draft.folder, name);
  }

  function collapseAll() {
    const paths: string[] = [];
    function walk(folder: TreeFolder) {
      for (const child of folder.folders) {
        paths.push(child.path);
        walk(child);
      }
    }
    walk(tree);
    setCollapsed(new Set(paths));
  }

  function onLink(target: string, nodeId: string | null) {
    if (nodeId !== null) {
      open(nodeId);
      return;
    }
    const ghost = ghostId(target);
    if (graph.nodes.some((node) => node.id === ghost)) open(ghost);
    else startNew(target);
  }

  function onTag(tag: string) {
    setTagFilter(tag);
    setHits(null);
    setDrawerOpen(true);
  }

  function onMention(mention: Mention) {
    if (mention.note_id !== undefined) open("note:" + mention.note_id);
    else if (mention.target) open("facts:" + mention.target, mention.fact_id ?? null);
  }

  function save(draft: Draft) {
    if (!editing) return;
    let existing: NoteDetail | null = detail;
    if (editing.isNew) existing = null;
    run(async () => {
      let result;
      try {
        result = await saveNote(draft, existing);
      } catch (failure) {
        // A 409 is either a stale editor (the note has a newer version) or a title another note uses.
        if (failure instanceof ConflictError && existing) {
          const latest = await fetchNote(existing.id);
          if (latest.version !== existing.version) setConflict(true);
        }
        throw failure;
      }
      setDetail(result.note);
      setEditing(null);
      setConflict(false);
      onSelect("note:" + result.note.id);
      if (result.renamed_from && result.stale_links > 0) {
        setRelinkOffer({ noteId: result.note.id, from: result.renamed_from, count: result.stale_links });
      }
      if (result.outcome === "unchanged") return "No changes to save.";
      let message = `Saved “${result.note.title}”.`;
      if (existing === null) message = `Created “${result.note.title}”.`;
      if (result.stale_facts > 0) message += ` ${plural(result.stale_facts, "fact")} still link to the old title; correct them in the Facts folder.`;
      return message;
    });
  }

  function relink(offer: RelinkOffer) {
    run(async () => {
      const result = await relinkNote(offer.noteId, offer.from);
      setRelinkOffer(null);
      let message = `Updated the links in ${plural(result.updated, "note")}. Each change is saved as a new version.`;
      if (result.stale_facts > 0) message += ` ${plural(result.stale_facts, "fact")} still use the old title; correct them in the Facts folder.`;
      return message;
    });
  }

  function archive(note: NoteDetail) {
    if (!window.confirm(`Archive “${note.title}”? Its file moves to the vault's .trash folder, as in Obsidian, and it leaves your folders, the map and search. Its versions stay in the history.`)) return;
    run(async () => {
      await archiveNote(note.id);
      setDetail(null);
      onSelect(null);
      return `Archived “${note.title}”: its file is in .trash. Links to it now show as not created yet.`;
    });
  }

  function reloadNewer() {
    if (!detail) return;
    run(async () => {
      const latest = await fetchNote(detail.id);
      setDetail(latest);
      setConflict(false);
      setEditing({ isNew: false, initial: { folder: latest.folder, title: latest.title, text: latest.text } });
      return "Loaded the newer version. Your unsaved changes were not kept.";
    });
  }

  async function search() {
    const question = query.trim();
    if (!question) return;
    setSearching(true);
    try {
      setHits(await searchMemory(question));
    } catch (failure) {
      if (failure instanceof Error) onError(failure.message);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setHits(null);
  }

  function onNavKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && drawerOpen) closeDrawer();
  }

  function ghostMentions(nodeId: string): Mention[] {
    const mentions: Mention[] = [];
    for (const edge of graph.edges) {
      if (edge.target !== nodeId) continue;
      const source = graph.nodes.find((node) => node.id === edge.source);
      if (!source) continue;
      if (source.kind === "note") mentions.push({ title: source.title, context: "", note_id: source.note_id, folder: source.folder ?? "" });
      if (source.kind === "facts") mentions.push({ title: source.title, context: "", target: source.target });
    }
    return mentions;
  }

  function content() {
    if (editing) {
      return <NoteEditor key={`${editing.isNew}-${detail?.id}-${detail?.version}`} initial={editing.initial} isNew={editing.isNew} focusText={editing.focusText}
        nodes={graph.nodes} folders={folders} busy={busy} conflict={conflict}
        onSave={save} onCancel={() => { setEditing(null); setConflict(false); }} onReload={reloadNewer} />;
    }
    if (selected === "facts:business" || selected === "facts:owner") {
      const target = selected.slice("facts:".length) as Target;
      return <FactsNote target={target} overview={overview} busy={busy} highlight={highlight} run={run} resolve={resolve} onLink={onLink} onTag={onTag} />;
    }
    if (selected === INSPECT_ID) return <InspectPanel overview={overview} />;
    if (selected && selected.startsWith("ghost:")) {
      const ghost = graph.nodes.find((node) => node.id === selected);
      if (ghost) return <GhostView title={ghost.title} mentions={ghostMentions(ghost.id)} busy={busy} onCreate={() => startNew(ghost.title)} onMention={onMention} />;
    }
    if (selectedNote !== null) {
      if (noteError) return <p className="error" role="alert">{noteError}</p>;
      if (!detail || detail.id !== selectedNote) return <p role="status"><span className="shimmer">Opening the note…</span></p>;
      return <NoteView note={detail} busy={busy} resolve={resolve} onLink={onLink} onTag={onTag}
        onEdit={() => setEditing({ isNew: false, initial: { folder: detail.folder, title: detail.title, text: detail.text } })}
        onArchive={() => archive(detail)} onMention={onMention} />;
    }
    const notes = graph.nodes.filter((node) => node.kind === "note").length;
    return <div className="notes-welcome">
      <h2>Your notes</h2>
      <p>{plural(notes, "note")} in your folders. Choose one on the left, or start a new one. Link notes with [[Title]] and they show up on the map.</p>
      <button type="button" className="account-submit" onClick={() => newItem("note")} disabled={busy}>New note</button>
    </div>;
  }

  return <div className="notes-layout" data-drawer={drawerOpen}>
    <div className="notes-scrim" aria-hidden="true" onClick={closeDrawer} />
    <aside id="notes-nav" className="notes-nav" aria-label="Folders and search" onKeyDown={onNavKey}>
      <div className="notes-nav-head">
        <div className="notes-actions" role="group" aria-label="Files">
          <button type="button" className="notes-action" aria-label="New note" title="New note" onClick={() => newItem("note")} disabled={busy}><Icon name="newNote" /></button>
          <button type="button" className="notes-action" aria-label="New folder" title="New folder" onClick={() => newItem("folder")} disabled={busy}><Icon name="newFolder" /></button>
          <button type="button" className="notes-action" aria-label="Collapse all" title="Collapse all" onClick={collapseAll}><Icon name="collapseAll" /></button>
        </div>
        <button type="button" className="icon-button notes-drawer-close" onClick={closeDrawer} aria-label="Close folders">×</button>
      </div>
      <form className="notes-search" role="search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <label className="sr-only" htmlFor="memory-question">Search memory</label>
        <input id="memory-question" ref={searchInput} value={query} maxLength={1000} placeholder="Search notes and facts"
          onChange={(event) => { setQuery(event.target.value); if (!event.target.value) setHits(null); }} />
        <button className="account-submit" disabled={searching || !query.trim()}>Search</button>
      </form>
      {tagFilter !== null && <p className="notes-filter">
        <span>Tagged <strong>#{tagFilter}</strong></span>
        <button type="button" className="text-button" onClick={() => setTagFilter(null)}>Show all notes</button>
      </p>}
      {hits !== null && <section className="notes-results" aria-label="Search results">
        <p className="notes-filter"><span>{plural(hits.length, "result")}</span><button type="button" className="text-button" onClick={clearSearch}>Back to folders</button></p>
        {hits.length === 0 && <p className="notes-empty">Nothing matches. Try a name or another keyword.</p>}
        <ul>
          {hits.map((hit) => {
            if (hit.kind === "fact") {
              return <li key={`fact-${hit.id}`}><button type="button" onClick={() => open("facts:" + hit.target, hit.id)}>
                <span className="result-kind">Fact [{hit.id}]</span><span>{hit.fact}</span></button></li>;
            }
            return <li key={`note-${hit.note_id}`}><button type="button" onClick={() => open("note:" + hit.note_id)}>
              <span className="result-kind">{hit.folder || "Note"}</span><strong>{hit.title}</strong><span>{hit.snippet}</span></button></li>;
          })}
        </ul>
      </section>}
      {hits === null && graph.skipped.length > 0 && <details className="notes-skipped">
        <summary>{plural(graph.skipped.length, "file")} in the vault not shown</summary>
        <ul>{graph.skipped.map((item) => <li key={item.path}><code>{item.path}</code> {item.reason}</li>)}</ul>
      </details>}
      {hits === null && <FolderTree root={tree} selected={selected} activeFolder={activeFolder} expanded={expanded} tagFilter={tagFilter} onOpen={(id) => open(id)}
        draft={draft} draftName={draftName} draftError={draftError} onDraftCommit={commitDraft} onDraftCancel={cancelDraft}
        onSelectFolder={setActiveFolder} onNew={(kind, folder) => newItem(kind, folder)}
        onToggle={(path, isOpen) => setCollapsed((current) => {
          const next = new Set(current);
          if (isOpen) next.delete(path);
          else next.add(path);
          return next;
        })} />}
    </aside>
    <section className="notes-content" aria-label="Note">
      <button type="button" ref={drawerButton} className="account-toggle notes-drawer-open" aria-controls="notes-nav" aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}>Folders</button>
      {relinkOffer && <div className="memory-notice notes-relink" role="status">
        <span>{stillLink(relinkOffer.count)} to “{relinkOffer.from.title}”.</span>
        <button type="button" className="account-submit" onClick={() => relink(relinkOffer)} disabled={busy}>Update {plural(relinkOffer.count, "note")}</button>
        <button type="button" className="text-button" onClick={() => setRelinkOffer(null)} disabled={busy}>Leave them</button>
      </div>}
      {content()}
    </section>
  </div>;
}
