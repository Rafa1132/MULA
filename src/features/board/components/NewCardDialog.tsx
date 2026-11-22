"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { BoardAgent, CardDraft } from "../types";

export const TITLE_MAX = 200;
export const NOTES_MAX = 4000;

type Props = {
  agents: BoardAgent[];
  onSubmit: (draft: CardDraft) => Promise<void>;
  onClosed: () => void;
};

/** Adds a card to To do. Nothing runs here: the card waits until someone presses Start on it. */
export default function NewCardDialog({ agents, onSubmit, onClosed }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  let firstAgent = "";
  if (agents.length > 0) firstAgent = agents[0].id;
  const [agent, setAgent] = useState(firstAgent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // A modal dialog traps focus, gives Escape and a backdrop, and returns focus to the opener on close.
    dialog.current?.showModal();
  }, []);

  function requestClose() {
    const dirty = title.trim() !== "" || notes.trim() !== "";
    if (dirty && !window.confirm("Discard this new card?")) return;
    dialog.current?.close();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError("Give the card a title."); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit({ title, notes, agent: agent || null });
      dialog.current?.close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="board-dialog board-new-dialog" aria-labelledby="board-new-title" onClose={onClosed}
    onCancel={(event) => { event.preventDefault(); requestClose(); }}
    onClick={(event) => { if (event.target === dialog.current) requestClose(); }}>
    <form className="board-form" onSubmit={submit}>
      <header className="board-panel-head">
        <h2 id="board-new-title">New card</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={requestClose}><span aria-hidden="true">×</span></button>
      </header>
      <p className="board-hint">The card waits in To do. Its agent only works on it after you press Start.</p>
      <label className="board-field">Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_MAX} required autoFocus />
      </label>
      <label className="board-field">Notes <span className="board-optional">optional</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={NOTES_MAX} rows={5} />
      </label>
      <label className="board-field">Agent
        <select value={agent} onChange={(event) => setAgent(event.target.value)}>
          {agents.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          <option value="">No agent yet</option>
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="board-form-actions">
        <button type="button" className="text-button" onClick={requestClose} disabled={busy}>Cancel</button>
        <button type="submit" className="account-submit" disabled={busy}>Add card</button>
      </div>
    </form>
  </dialog>;
}
