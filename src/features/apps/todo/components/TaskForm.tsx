"use client";

import { useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { TaskError } from "../store.ts";

export type TaskFields = { title: string; dueDate: string; note: string };

type Props = {
  /** Prefix for field ids, so the add form and each edit form have unique labels. */
  idPrefix: string;
  initial?: TaskFields;
  submitLabel: string;
  /** Throws TaskError for invalid input; the message is shown under the title. */
  onSubmit: (fields: TaskFields) => void;
  /** Edit forms only: Cancel button and Escape. */
  onCancel?: () => void;
  /** Whether to clear the fields after a successful submit (the add form). */
  resetAfterSubmit?: boolean;
};

const EMPTY: TaskFields = { title: "", dueDate: "", note: "" };

/**
 * Title (required), due date and note, each with a <label>. Enter in any field submits,
 * because it is a real form with a submit button. Used for adding and for inline edits.
 */
export default function TaskForm({ idPrefix, initial = EMPTY, submitLabel, onSubmit, onCancel, resetAfterSubmit = false }: Props) {
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState("");
  const titleField = useRef<HTMLInputElement>(null);
  const errorId = `${idPrefix}-error`;

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSubmit(fields);
    } catch (failure) {
      // Only input problems are shown here; anything else is a bug and should surface.
      if (!(failure instanceof TaskError)) throw failure;
      setError(failure.message);
      titleField.current?.focus();
      return;
    }
    setError("");
    if (resetAfterSubmit) {
      setFields(EMPTY);
      titleField.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  let describedBy: string | undefined;
  if (error) describedBy = errorId;
  let cancel = null;
  if (onCancel) cancel = <button type="button" className="apps-button" onClick={onCancel}>Cancel</button>;

  return (
    <form className="todo-form" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <div className="todo-field todo-field-title">
        <label htmlFor={`${idPrefix}-title`}>Title</label>
        <input ref={titleField} id={`${idPrefix}-title`} value={fields.title} autoComplete="off" maxLength={200}
          required aria-invalid={error !== ""} aria-describedby={describedBy}
          onChange={(event) => setFields({ ...fields, title: event.target.value })} />
      </div>
      <div className="todo-field todo-field-date">
        <label htmlFor={`${idPrefix}-due`}>Due date <span className="todo-optional">(optional)</span></label>
        <input id={`${idPrefix}-due`} type="date" value={fields.dueDate} onChange={(event) => setFields({ ...fields, dueDate: event.target.value })} />
      </div>
      <div className="todo-field todo-field-note">
        <label htmlFor={`${idPrefix}-note`}>Note <span className="todo-optional">(optional)</span></label>
        <input id={`${idPrefix}-note`} value={fields.note} autoComplete="off" maxLength={1000} onChange={(event) => setFields({ ...fields, note: event.target.value })} />
      </div>
      <div className="todo-form-actions">
        <button type="submit" className="apps-button apps-button-primary">{submitLabel}</button>
        {cancel}
      </div>
      {error && <p id={errorId} className="todo-error" role="alert">{error}</p>}
    </form>
  );
}
