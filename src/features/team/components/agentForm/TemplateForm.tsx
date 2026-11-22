"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Brain } from "../../services/team";
import type { AgentTemplate, ChannelId, ChannelOption, TemplateDraft, Tone } from "../../services/templates";
import { PROMPT_MAX, TONE_LABELS, TONES, validateTemplate } from "../../services/templates";

type Props = {
  template: AgentTemplate;
  initial: TemplateDraft;
  brains: Record<string, Brain>;
  channels: ChannelOption[];
  inventoryHref: string;
  onSubmit: (draft: TemplateDraft) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

/**
 * Adding a server agent from its template (Customer Service): instructions, tools with their
 * approval rule, brain, tone and channels. It runs on the server once added, unlike a blank agent.
 */
export default function TemplateForm({ template, initial, brains, channels, inventoryHref, onSubmit, onCancel, onDirtyChange }: Props) {
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const errors = validateTemplate(draft, template, Object.keys(brains), channels);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  function update(changes: Partial<TemplateDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setFailure("");
  }

  function toggle<T>(list: T[], value: T, on: boolean) {
    if (on) return [...list.filter((entry) => entry !== value), value];
    return list.filter((entry) => entry !== value);
  }

  function shown(field: keyof typeof errors) {
    if (submitted) return errors[field];
    return undefined;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      await onSubmit(draft);
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  let submitLabel = `Add ${template.name}`;
  if (busy) submitLabel = "Adding…";
  return <form className="agent-form" onSubmit={submit} noValidate>
    <p className="settings-help">{template.description} Unlike a blank agent, it runs on the server as soon as it's added.</p>

    <fieldset className="agent-form-group agent-template-group" id="template-tools">
      <legend>Tools</legend>
      {Object.entries(template.tools).map(([id, label]) => {
        let rule = "Runs without asking you";
        if (template.approvals[id]) rule = "Waits for your approval";
        return <label key={id} className="agent-check">
          <input type="checkbox" checked={draft.tools.includes(id)} onChange={(event) => update({ tools: toggle(draft.tools, id, event.target.checked) })} />
          <span>{label}<span className="settings-help"> · {rule}</span></span>
        </label>;
      })}
      <p className="settings-help">This agent has no tool that moves money, changes orders or shares files. A customer asking for one of those is handed to you as a ticket.</p>
      {shown("tools") && <p className="agent-form-error" role="alert">{shown("tools")}</p>}
    </fieldset>

    <fieldset className="agent-form-group agent-template-group" id="template-channels">
      <legend>Channels</legend>
      {channels.map((channel) => <label key={channel.id} className="agent-check">
        <input type="checkbox" checked={draft.channels.includes(channel.id)} disabled={!channel.available && !draft.channels.includes(channel.id)}
          onChange={(event) => update({ channels: toggle<ChannelId>(draft.channels, channel.id, event.target.checked) })} />
        <span>{channel.name}<span className="settings-help"> · {channel.hint}</span></span>
      </label>)}
      {channels.some((channel) => !channel.available) && <a className="text-button" href={inventoryHref}>Connect in Inventory</a>}
      {shown("channels") && <p className="agent-form-error" role="alert">{shown("channels")}</p>}
    </fieldset>

    <div className="agent-form-field">
      <label htmlFor="template-tone">Tone</label>
      <select id="template-tone" value={draft.tone} onChange={(event) => update({ tone: event.target.value as Tone })}>
        {TONES.map((tone) => <option key={tone} value={tone}>{TONE_LABELS[tone]}</option>)}
      </select>
    </div>

    <div className="agent-form-field">
      <label htmlFor="template-brain">Brain</label>
      <select id="template-brain" value={draft.brain} onChange={(event) => update({ brain: event.target.value })}>
        {Object.entries(brains).map(([id, brain]) => {
          let label = `${brain.name} · ${brain.host}`;
          if (brain.status === "needs_setup") label += " (needs setup)";
          return <option key={id} value={id} disabled={brain.status === "needs_setup"}>{label}</option>;
        })}
      </select>
      <p className="settings-help">Each customer message is one turn on this brain. A local brain costs nothing; a cloud brain uses credits per reply.</p>
      {shown("brain") && <p className="agent-form-error" role="alert">{shown("brain")}</p>}
    </div>

    <div className="agent-form-field">
      <label htmlFor="template-prompt">Instructions</label>
      <textarea id="template-prompt" rows={6} maxLength={PROMPT_MAX} value={draft.prompt} onChange={(event) => update({ prompt: event.target.value })} />
      <p className="agent-form-count">{draft.prompt.length.toLocaleString("en")} / {PROMPT_MAX.toLocaleString("en")} characters</p>
      {shown("prompt") && <p className="agent-form-error" role="alert">{shown("prompt")}</p>}
    </div>

    {failure && <p className="error" role="alert">{failure}</p>}
    <footer className="settings-footer agent-form-footer">
      <div className="settings-actions">
        <button type="button" className="map-reset" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="account-submit" disabled={busy}>{submitLabel}</button>
      </div>
    </footer>
  </form>;
}
