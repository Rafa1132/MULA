"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import type { Brain } from "../../services/team";
import type { AgentTemplate, ChannelOption, TemplateDraft } from "../../services/templates";
import { templateDraft } from "../../services/templates";
import AgentForm from "./AgentForm";
import TemplateForm from "./TemplateForm";

/** Server templates the Add agent form can start from (only in create mode). */
export type TemplateChoice = {
  templates: AgentTemplate[];
  brains: Record<string, Brain>;
  defaultBrain: string;
  channels: ChannelOption[];
  inventoryHref: string;
  onAdd: (templateId: string, draft: TemplateDraft) => Promise<void>;
};

type Props = Omit<ComponentProps<typeof AgentForm>, "onCancel" | "onDirtyChange" | "onSubmit" | "onDelete"> & {
  title: string;
  subtitle: string;
  onSubmit: ComponentProps<typeof AgentForm>["onSubmit"];
  onDelete?: ComponentProps<typeof AgentForm>["onDelete"];
  onClosed: () => void;
  templateChoice?: TemplateChoice;
};

/**
 * The Add agent form (and a saved agent's detail) in the same side panel as the agent settings.
 * Cancel, Escape, the close button and the backdrop all ask first when there are unsaved changes.
 */
export default function AgentFormDialog({ title, subtitle, onClosed, onSubmit, onDelete, templateChoice, ...form }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  // "" is the blank form; otherwise the id of the template being added.
  const [start, setStart] = useState("");
  let templates: AgentTemplate[] = [];
  if (templateChoice && form.mode === "create") templates = templateChoice.templates;
  const template = templates.find((entry) => entry.id === start);

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

  function choose(next: string) {
    if (next === start) return;
    if (dirty.current && !window.confirm("Discard what you entered and start over?")) return;
    dirty.current = false;
    setStart(next);
  }

  async function addTemplate(draft: TemplateDraft) {
    if (!templateChoice || !template) return;
    await templateChoice.onAdd(template.id, draft);
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
      {templates.length > 0 && <fieldset className="agent-start-from">
        <legend>Start from</legend>
        <button type="button" className="agent-chip" aria-pressed={start === ""} onClick={() => choose("")}>Blank</button>
        {templates.map((entry) => <button key={entry.id} type="button" className="agent-chip" aria-pressed={start === entry.id} onClick={() => choose(entry.id)}>{entry.name}</button>)}
      </fieldset>}
      {!template && <AgentForm {...form} onSubmit={submit} onDelete={remove} onCancel={requestClose} onDirtyChange={onDirtyChange} />}
      {template && templateChoice && <TemplateForm key={template.id} template={template} brains={templateChoice.brains} channels={templateChoice.channels}
        initial={templateDraft(template, templateChoice.defaultBrain, templateChoice.channels)} inventoryHref={templateChoice.inventoryHref}
        onSubmit={addTemplate} onCancel={requestClose} onDirtyChange={onDirtyChange} />}
    </section>
  </dialog>;
}
