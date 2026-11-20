"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { FIELD_LABELS } from "../services/orchestrator";
import type { About, Field } from "../services/orchestrator";

type Props = {
  initial: About;
  idPrefix: string;
  submitLabel: string;
  busy: boolean;
  onSave: (about: About) => Promise<void>;
  onCancel?: () => void;
};

const FIELDS = Object.keys(FIELD_LABELS) as Field[];

/** The four USER.md answers as one form: the onboarding summary's Edit, and Settings. */
export default function AboutForm({ initial, idPrefix, submitLabel, busy, onSave, onCancel }: Props) {
  const [values, setValues] = useState<Record<Field, string>>(() => {
    const start = {} as Record<Field, string>;
    for (const field of FIELDS) start[field] = initial[field] ?? "";
    return start;
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const about = {} as About;
    // An emptied field means "not given", as the server reads it.
    for (const field of FIELDS) {
      const value = values[field].trim();
      if (value) about[field] = value;
      else about[field] = null;
    }
    await onSave(about);
  }

  return <form className="about-form" onSubmit={submit}>
    {FIELDS.map((field) => <div className="about-field" key={field}>
      <label htmlFor={`${idPrefix}-${field}`}>{FIELD_LABELS[field]}</label>
      <input id={`${idPrefix}-${field}`} value={values[field]} maxLength={300} disabled={busy}
        onChange={(event) => setValues({ ...values, [field]: event.target.value })} />
    </div>)}
    <p className="about-hint">Leave a field empty to remove it. Passwords, card or ID numbers, emails and phone numbers are never kept.</p>
    <div className="assistant-actions">
      <button type="submit" className="account-submit" disabled={busy}>{submitLabel}</button>
      {onCancel && <button type="button" className="account-toggle" onClick={onCancel} disabled={busy}>Cancel</button>}
    </div>
  </form>;
}
