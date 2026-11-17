"use client";

import { ACTORS, Audit, Overview } from "../services/facts";

const ACTIONS: Record<string, string> = {
  saved: "Fact saved", replaced: "Fact replaced", retired: "Fact retired", duplicate: "Duplicate fact skipped", refused: "Fact refused",
  note_created: "Note created", note_saved: "Note saved", note_relinked: "Links updated in note", note_archived: "Note archived", note_refused: "Note refused",
  note_moved: "Note moved", folder_created: "Folder created",
};

function when(iso: string) {
  return new Date(iso).toLocaleString();
}

function change(row: Audit) {
  let subject = "";
  if (row.entry_id !== null) subject = ` [${row.entry_id}]`;
  else if (row.detail?.note_id !== undefined && row.detail.note_id !== null) subject = ` (note ${row.detail.note_id})`;
  return `${ACTIONS[row.action] || row.action}${subject} · ${ACTORS[row.actor] || row.actor} · ${when(row.occurred_at)}`;
}

/** What the Operator actually receives from memory, and the audit trail of every change. */
export default function InspectPanel({ overview }: { overview: Overview }) {
  const retrieval = overview.last_retrieval;
  return <article className="note-view" aria-labelledby="note-title">
    <header className="note-header">
      <p className="note-path">Facts</p>
      <h2 id="note-title">What the Operator reads</h2>
      <p className="note-meta"><span>The Operator gets the facts summary on every request, plus up to three facts that match it. Notes are for you and are not sent to the model.</span></p>
    </header>
    <section className="memory-summary" aria-label="Summary">
      <h3>The summary</h3>
      <p className="memory-help">Mula writes <code>MEMORY.md</code> from your current facts after every change, newest first, within the same limits as a built-in memory.</p>
      <pre>{overview.summary}</pre>
    </section>
    <section className="memory-inspection-block">
      <h3>Memory used for the last request</h3>
      {!retrieval && <p className="memory-help">No requests have used this memory yet.</p>}
      {retrieval && <>
        <small>{when(retrieval.occurred_at)}</small>
        <p className="memory-question">{retrieval.question}</p>
        {retrieval.entries.length === 0 && <p className="memory-help">No saved facts matched.</p>}
        {retrieval.entries.map((entry) => <article key={entry.id} className="memory-result"><code>[{entry.id}]</code><p>{entry.fact}</p></article>)}
      </>}
    </section>
    <section className="memory-changes">
      <h3>Recent changes</h3>
      {overview.audit.length === 0 && <p>No changes yet.</p>}
      {overview.audit.map((row) => <p key={row.id}>{change(row)}</p>)}
      <p>Every save, correction, retirement and refusal is logged with ids and hashes, never with the text.</p>
    </section>
    <p className="memory-help">Stored in <code>{overview.relative_root}/</code></p>
  </article>;
}
