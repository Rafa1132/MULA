"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { EntryDraft, KnowledgeKind } from "../types";
import { BODY_MAX, KIND_LABELS, KINDS, PRICE_MAX, TITLE_MAX, validateEntry } from "../services/knowledge";

type Props = {
  initial: EntryDraft;
  submitLabel: string;
  onSubmit: (draft: EntryDraft) => Promise<void>;
  onCancel: () => void;
};

/** Adds or edits one entry. Errors show after the first Save attempt, next to their field. */
export default function EntryForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<EntryDraft>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const errors = validateEntry(draft);
  const id = (field: string) => `knowledge-${field}`;

  function shown(field: keyof EntryDraft) {
    if (submitted) return errors[field];
    return undefined;
  }

  function update(changes: Partial<EntryDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setFailure("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      await onSubmit(draft);
    } catch (error) {
      setFailure((error as Error).message);
      setBusy(false);
    }
  }

  let label = submitLabel;
  if (busy) label = "Saving…";
  return <form className="knowledge-form" onSubmit={submit} noValidate>
    <label className="knowledge-field">Kind
      <select id={id("kind")} value={draft.kind} onChange={(event) => update({ kind: event.target.value as KnowledgeKind })}>
        {KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
      </select>
    </label>
    {/* Errors sit outside the labels, so each field's name stays just its label. */}
    <div className="knowledge-field">
      <label htmlFor={id("title")}>Title</label>
      <input id={id("title")} value={draft.title} maxLength={TITLE_MAX + 20} onChange={(event) => update({ title: event.target.value })}
        aria-invalid={shown("title") !== undefined} aria-describedby={id("title-error")} />
      {shown("title") && <span className="knowledge-error" id={id("title-error")}>{shown("title")}</span>}
    </div>
    <div className="knowledge-field">
      <label htmlFor={id("body")}>What customers should be told</label>
      <textarea id={id("body")} rows={4} value={draft.body} maxLength={BODY_MAX} onChange={(event) => update({ body: event.target.value })}
        aria-invalid={shown("body") !== undefined} aria-describedby={id("body-error")} />
      {shown("body") && <span className="knowledge-error" id={id("body-error")}>{shown("body")}</span>}
    </div>
    {draft.kind === "product" && <div className="knowledge-field">
      <label htmlFor={id("price")}>Price <span className="knowledge-optional">optional</span></label>
      <input id={id("price")} value={draft.price} maxLength={PRICE_MAX} placeholder="Rp 25.000" onChange={(event) => update({ price: event.target.value })}
        aria-invalid={shown("price") !== undefined} aria-describedby={id("price-error")} />
      {shown("price") && <span className="knowledge-error" id={id("price-error")}>{shown("price")}</span>}
    </div>}
    {failure && <p className="error" role="alert">{failure}</p>}
    <div className="knowledge-form-actions">
      <button type="button" className="map-reset" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="submit" className="account-submit" disabled={busy}>{label}</button>
    </div>
  </form>;
}
