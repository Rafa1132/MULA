"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ComponentProps } from "react";
import AgentForm from "./AgentForm";

type Props = Omit<ComponentProps<typeof AgentForm>, "onCancel" | "onDirtyChange" | "onSubmit" | "onDelete"> & {
  title: string;
  subtitle: string;
  onSubmit: ComponentProps<typeof AgentForm>["onSubmit"];
  onDelete?: ComponentProps<typeof AgentForm>["onDelete"];
  onClosed: () => void;
};

/**
 * The Add agent form (and a saved agent's detail) in the same side panel as the agent settings.
 * Cancel, Escape, the close button and the backdrop all ask first when there are unsaved changes.
 */
export default function AgentFormDialog({ title, subtitle, onClosed, onSubmit, onDelete, ...form }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);

  useEffect(() => {
    // A modal dialog traps focus, gives Escape and a backdrop, and returns focus to the opener on close.
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const onDirtyChange = useCallback((value: boolean) => { dirty.current = value; }, []);

  function requestClose() {
    if (dirty.current && !window.confirm("Discard your unsaved changes to this agent?")) return;
    dialog.current?.close();
  }

  async function submit(draft: Parameters<Props["onSubmit"]>[0]) {
    await onSubmit(draft);
    dirty.current = false;
    dialog.current?.close();
  }

  let remove: (() => Promise<void>) | undefined;
  if (onDelete) {
    remove = async () => {
      await onDelete();
      dirty.current = false;
      dialog.current?.close();
    };
  }

  return <dialog ref={dialog} className="agent-dialog agent-form-dialog" aria-labelledby="agent-form-title" onClose={onClosed}
    onCancel={(event) => { event.preventDefault(); requestClose(); }}
    onClick={(event) => { if (event.target === dialog.current) requestClose(); }}>
    <section className="agent-inspector">
      <header className="inspector-heading">
        <div><div className="eyebrow">{subtitle}</div><h2 id="agent-form-title">{title}</h2></div>
        <button type="button" className="icon-button dialog-close" aria-label="Close" onClick={requestClose}><span aria-hidden="true">×</span></button>
      </header>
      <AgentForm {...form} onSubmit={submit} onDelete={remove} onCancel={requestClose} onDirtyChange={onDirtyChange} />
    </section>
  </dialog>;
}
