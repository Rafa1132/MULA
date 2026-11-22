"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { BoardAgent, Card, CardDetails } from "../types";
import { addComment, archiveCard, changeCard, loadCard, markDone, sendBack, startCard } from "../services/board";
import { actionsFor, COLUMN_LABELS, formatTime, statusLine } from "../services/columns";
import { NOTES_MAX, TITLE_MAX } from "./NewCardDialog";

const COMMENT_MAX = 2000;

type Props = {
  card: Card;
  agents: BoardAgent[];
  // Called after any change, so the board reloads; `null` when the card was archived.
  onChanged: (card: CardDetails | null, message: string) => void;
  onClosed: () => void;
};

/** One card's side panel: its notes, the agent's latest result, the comment thread, and its actions. */
export default function CardPanel({ card, agents, onChanged, onClosed }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<CardDetails | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes);
  let initialAgent = "";
  if (card.agent !== null) initialAgent = card.agent;
  const [agent, setAgent] = useState(initialAgent);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { dialog.current?.showModal(); }, []);

  // Reload when the board's copy of the card changes (polling while it works).
  useEffect(() => {
    const controller = new AbortController();
    loadCard(card.id, controller.signal).then(setDetails).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [card.id, card.status, card.column]);

  async function act(run: () => Promise<CardDetails | null>, message: string) {
    setBusy(true);
    setError("");
    try {
      const changed = await run();
      if (changed === null) {
        onChanged(null, message);
        dialog.current?.close();
        return;
      }
      setDetails(changed);
      onChanged(changed, message);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function archive() {
    if (!window.confirm("Archive this card? It leaves the Board.")) return;
    act(async () => { await archiveCard(card.id); return null; }, "Card archived.");
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError("Give the card a title."); return; }
    act(async () => {
      const changed = await changeCard(card.id, { title, notes, agent: agent || null });
      setEditing(false);
      return changed;
    }, "Card saved.");
  }

  function postComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    act(async () => {
      const changed = await addComment(card.id, comment);
      setComment("");
      return changed;
    }, "Comment added.");
  }

  let shown: Card = card;
  if (details !== null) shown = details;
  const actions = actionsFor(shown);
  let latestRun = null;
  if (details !== null && details.runs.length > 0) latestRun = details.runs[details.runs.length - 1];
  let summary = shown.result;
  if (details !== null && details.latest_summary) summary = details.latest_summary;

  return <dialog ref={dialog} className="board-dialog board-panel" aria-labelledby="board-card-title" onClose={onClosed}
    onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
    <section className="board-panel-body">
      <header className="board-panel-head">
        <div>
          <p className="board-panel-column">{COLUMN_LABELS[shown.column]}</p>
          <h2 id="board-card-title">{shown.title}</h2>
          <p className="board-hint">{statusLine(shown)}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={() => dialog.current?.close()}><span aria-hidden="true">×</span></button>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {!editing && <>
        {shown.notes && <p className="board-notes">{shown.notes}</p>}
        {summary && <div className="board-result"><h3>Agent&apos;s result</h3><p>{summary}</p></div>}
        {latestRun !== null && latestRun.error && <div className="board-result" data-kind="error"><h3>Last run stopped</h3><p>{latestRun.error}</p></div>}
        {!latestRun && shown.last_error && <div className="board-result" data-kind="error"><h3>Last run stopped</h3><p>{shown.last_error}</p></div>}

        <div className="board-actions">
          {actions.start && <button type="button" className="account-submit" disabled={busy}
            onClick={() => act(() => startCard(card.id), "Started. The agent picks it up within about 15 seconds.")}>{actions.startLabel}</button>}
          {actions.sendBack && <button type="button" className="text-button" disabled={busy}
            onClick={() => act(() => sendBack(card.id), "Sent back to To do.")}>Send back</button>}
          {actions.done && <button type="button" className="text-button" disabled={busy}
            onClick={() => act(() => markDone(card.id), "Marked done.")}>Mark done</button>}
          {actions.edit && <button type="button" className="text-button" disabled={busy} onClick={() => setEditing(true)}>Edit</button>}
          {actions.archive && <button type="button" className="text-button board-archive" disabled={busy} onClick={archive}>Archive</button>}
        </div>
        {actions.start && <p className="board-hint">{actions.startLabel} runs {shown.agent_name} with its brain from My agents; a cloud brain may use credits.</p>}
        {!actions.start && (shown.column === "todo" || shown.column === "needs_you") && <p className="board-hint">Choose an agent (Edit) before starting this card.</p>}
      </>}

      {editing && <form className="board-form" onSubmit={save}>
        <label className="board-field">Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_MAX} required />
        </label>
        <label className="board-field">Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={NOTES_MAX} rows={5} />
        </label>
        <label className="board-field">Agent
          <select value={agent} onChange={(event) => setAgent(event.target.value)}>
            {agents.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            <option value="">No agent yet</option>
          </select>
        </label>
        <div className="board-form-actions">
          <button type="button" className="text-button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="account-submit" disabled={busy}>Save</button>
        </div>
      </form>}

      <section className="board-comments" aria-labelledby="board-comments-title">
        <h3 id="board-comments-title">Comments</h3>
        {details === null && !error && <p className="board-hint" role="status">Loading…</p>}
        {details !== null && details.comments.length === 0 && <p className="board-hint">No comments yet.</p>}
        {details !== null && details.comments.length > 0 && <ol className="board-thread">
          {details.comments.map((entry, index) => <li key={index}>
            <p className="board-comment-meta"><strong>{entry.author}</strong> <span>{formatTime(entry.created_at)}</span></p>
            <p className="board-comment-body">{entry.body}</p>
          </li>)}
        </ol>}
        <form className="board-form" onSubmit={postComment}>
          <label className="board-field">Add a comment
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={COMMENT_MAX} rows={3} />
          </label>
          <div className="board-form-actions">
            <button type="submit" className="text-button" disabled={busy || !comment.trim()}>Comment</button>
          </div>
        </form>
      </section>
    </section>
  </dialog>;
}
