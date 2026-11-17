"use client";

import { useState } from "react";
import { ACTORS, Entry, Overview, addFact, correctFact, retireFact } from "../services/facts";
import { Target } from "../services/notes";
import NoteMarkdown from "./NoteMarkdown";

const TITLES: Record<Target, string> = { business: "About the business", owner: "About the owner" };
const PLACEHOLDERS: Record<Target, string> = { business: "Our coffee supplier is Aroma. Deliveries arrive on Tuesdays.", owner: "Keep answers short." };

type Props = {
  target: Target;
  overview: Overview;
  busy: boolean;
  // Highlighted after a search hit, so the fact is easy to find.
  highlight: number | null;
  run: (action: () => Promise<string>) => void;
  resolve: (target: string) => string | null;
  onLink: (target: string, nodeId: string | null) => void;
  onTag: (tag: string) => void;
};

function plural(count: number, noun: string) {
  if (count === 1) return `${count} ${noun}`;
  return `${count} ${noun}s`;
}

function supersededLabel(entry: Entry) {
  if (entry.superseded_reason === "replaced") return `Replaced by [${entry.superseded_by}]`;
  return "Retired";
}

function when(iso: string) {
  return new Date(iso).toLocaleString();
}

/**
 * One of the two generated Facts notes. Facts are append-only: Correct saves a new version and
 * keeps the old one in History, and Retire takes a fact out of use without deleting it.
 */
export default function FactsNote({ target, overview, busy, highlight, run, resolve, onLink, onTag }: Props) {
  const [newFact, setNewFact] = useState("");
  const [correcting, setCorrecting] = useState<number | null>(null);
  const [correction, setCorrection] = useState("");
  const active = overview.entries.filter((entry) => entry.target === target && !entry.superseded);
  const history = overview.entries.filter((entry) => entry.target === target && entry.superseded);
  const title = TITLES[target];

  function add() {
    const fact = newFact.trim();
    if (!fact) return;
    run(async () => {
      const body = await addFact(target, fact);
      setNewFact("");
      if (body.outcome === "duplicate") return `Already in memory as [${body.entry.id}].`;
      return `Saved as [${body.entry.id}]. The Operator uses it from the next request.`;
    });
  }

  function correct(entry: Entry) {
    const fact = correction.trim();
    if (!fact) return;
    run(async () => {
      const body = await correctFact(entry.id, fact);
      setCorrecting(null);
      setCorrection("");
      return `Saved as [${body.entry.id}], replacing [${entry.id}]. The old version stays in the history.`;
    });
  }

  function retire(entry: Entry) {
    if (!window.confirm("Retire this memory? It leaves the summary and retrieval, and stays in the history.")) return;
    run(async () => {
      await retireFact(entry.id);
      return `Retired [${entry.id}].`;
    });
  }

  function renderEntry(entry: Entry) {
    const editing = correcting === entry.id;
    return <li key={entry.id} className="memory-entry" data-superseded={entry.superseded} data-highlight={entry.id === highlight}>
      <div className="memory-entry-head"><code>[{entry.id}]</code><small>{ACTORS[entry.actor] || entry.actor} · {when(entry.created_at)}</small></div>
      <NoteMarkdown text={entry.fact} resolve={resolve} onLink={onLink} onTag={onTag} />
      {entry.related.length > 0 && <small className="memory-flag">May overlap with {entry.related.map((id) => `[${id}]`).join(", ")}. Correct or retire the one that no longer holds.</small>}
      {entry.superseded && <small>{supersededLabel(entry)} · {entry.superseded_at && when(entry.superseded_at)}</small>}
      {!entry.superseded && !editing && <div className="memory-entry-actions">
        <button className="text-button" onClick={() => { setCorrecting(entry.id); setCorrection(entry.fact); }} disabled={busy}>Correct</button>
        <button className="text-button" onClick={() => retire(entry)} disabled={busy}>Retire</button>
      </div>}
      {editing && <form className="memory-correction" onSubmit={(event) => { event.preventDefault(); correct(entry); }}>
        <label className="sr-only" htmlFor={`correction-${entry.id}`}>New version of memory {entry.id}</label>
        <textarea id={`correction-${entry.id}`} value={correction} maxLength={500} onChange={(event) => setCorrection(event.target.value)} disabled={busy} />
        <div>
          <button type="button" className="account-toggle" onClick={() => setCorrecting(null)} disabled={busy}>Cancel</button>
          <button className="account-submit" disabled={busy || !correction.trim() || correction.trim() === entry.fact}>Save correction</button>
        </div>
      </form>}
    </li>;
  }

  return <article className="note-view" aria-labelledby="note-title">
    <header className="note-header">
      <p className="note-path">Facts</p>
      <h2 id="note-title">{title}</h2>
      <p className="note-meta"><span>One fact per line, saved by you or the Operator. The Operator reads these on every request. Nothing is ever rewritten: a correction keeps the old version in the history.</span></p>
    </header>
    <form className="memory-add" onSubmit={(event) => { event.preventDefault(); add(); }}>
      <label className="sr-only" htmlFor="memory-fact">New fact {title.toLowerCase()}</label>
      <input id="memory-fact" value={newFact} maxLength={500} onChange={(event) => setNewFact(event.target.value)} placeholder={PLACEHOLDERS[target]} disabled={busy} />
      <button className="account-submit" disabled={busy || !newFact.trim()}>Add fact</button>
    </form>
    <section className="memory-section" aria-label={title}>
      {active.length === 0 && <p className="memory-help">Nothing saved yet. Tell the Operator something worth keeping, or add it here.</p>}
      <ul className="memory-list">{active.map(renderEntry)}</ul>
      {history.length > 0 && <details className="memory-history"><summary>History · {plural(history.length, "earlier version")}</summary><ul className="memory-list">{history.map(renderEntry)}</ul></details>}
    </section>
  </article>;
}
