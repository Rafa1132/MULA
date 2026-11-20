"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { describeIssue, isUsable, referenceIssues } from "@/features/inventory";
import type { AgentDraft } from "../../services/workspaceAgents";
import type { AgentField, AgentSummary, FormContext } from "../../services/agentForm";
import { approvalsFor, DESCRIPTION_MAX, firstErrorField, INSTRUCTIONS_MAX, isDirty, isValid, NAME_MAX, ROLE_MAX, SUGGESTED_ROLES, validateDraft } from "../../services/agentForm";
import ApprovalSwitches from "./ApprovalSwitches";
import FieldError, { controlProps, fieldId } from "./FieldError";
import HandoffChecklist from "./HandoffChecklist";
import InventoryChecklist from "./InventoryChecklist";

type Props = {
  mode: "create" | "edit";
  initial: AgentDraft;
  context: FormContext;
  projectId: string;
  onSubmit: (draft: AgentDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
};

/** Moves focus to a field; for a group (a fieldset), to its first control that can take focus. */
function focusField(field: AgentField) {
  let target = field;
  // "At least one tool or skill" is shown on the Tools list.
  if (field === "capabilities") target = "tools";
  const element = document.getElementById(fieldId(target));
  if (!element) return;
  if (element instanceof HTMLFieldSetElement) {
    const first = element.querySelector<HTMLInputElement>("input:not(:disabled)");
    if (first) { first.focus(); return; }
  }
  element.focus();
}

export default function AgentForm({ mode, initial, context, projectId, onSubmit, onCancel, onDelete, onDirtyChange }: Props) {
  const [draft, setDraft] = useState<AgentDraft>(initial);
  // Errors show for fields the owner has changed or left, and for every field after a Create attempt.
  const [touched, setTouched] = useState<Set<AgentField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const errors = validateDraft(draft, context);
  const valid = isValid(errors);
  const dirty = isDirty(draft, initial);
  const { inventory, workspaceId } = context;
  const ofType = (type: string) => inventory.filter((entry) => entry.type === type && entry.workspaceId === workspaceId);
  const models = ofType("model");
  const issues = referenceIssues(initial, inventory, workspaceId);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  function shown(field: AgentField) {
    if (submitted || touched.has(field)) return errors[field];
    return undefined;
  }

  function touch(...fields: AgentField[]) {
    setTouched((current) => new Set([...current, ...fields]));
  }

  function update(changes: Partial<AgentDraft>, ...fields: AgentField[]) {
    setDraft((current) => ({ ...current, ...changes }));
    setFailure("");
    touch(...fields);
  }

  function setTools(tools: string[]) {
    update({ tools, approvals: approvalsFor(tools, draft.approvals, inventory, workspaceId) }, "tools", "capabilities");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!valid) {
      // Create stays focusable (aria-disabled), so pressing it explains what is missing.
      setSubmitted(true);
      const first = firstErrorField(errors);
      if (first) focusField(first);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(draft);
    } catch (error) {
      if (error instanceof Error) setFailure(error.message);
      else setFailure("Could not save the agent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete || busy) return;
    if (!window.confirm(`Delete ${initial.name}? Its inventory items stay installed.`)) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (error) {
      if (error instanceof Error) setFailure(error.message);
      setBusy(false);
    }
  }

  let submitLabel = "Create agent";
  if (mode === "edit") submitLabel = "Save changes";
  if (busy) submitLabel = "Saving…";
  const otherAgents: AgentSummary[] = context.otherAgents;

  return <form className="agent-form" onSubmit={submit} noValidate>
    {issues.length > 0 && <div className="agent-form-warning" role="note">
      <strong>Some items this agent uses need attention</strong>
      <ul>{issues.map((issue) => <li key={`${issue.field}-${issue.id}`}>{describeIssue(issue)}</li>)}</ul>
    </div>}

    <div className="agent-form-field">
      <label htmlFor={fieldId("name")}>Name <span className="agent-required">required</span></label>
      <input id={fieldId("name")} value={draft.name} maxLength={NAME_MAX + 20} autoComplete="off" required
        onChange={(event) => update({ name: event.target.value })} onBlur={() => touch("name")} {...controlProps("name", shown("name"))} />
      <FieldError field="name" message={shown("name")} />
    </div>

    <div className="agent-form-field">
      <label htmlFor={fieldId("description")}>Short description <span className="agent-optional">optional</span></label>
      <input id={fieldId("description")} value={draft.description} onChange={(event) => update({ description: event.target.value }, "description")}
        {...controlProps("description", shown("description"))} />
      <FieldError field="description" message={shown("description")} />
      <p className="agent-form-count">{draft.description.trim().length} / {DESCRIPTION_MAX}</p>
    </div>

    <div className="agent-form-field">
      <label htmlFor={fieldId("role")}>Role or purpose</label>
      <input id={fieldId("role")} value={draft.role} placeholder="What it's for, in a few words" onChange={(event) => update({ role: event.target.value }, "role")}
        {...controlProps("role", shown("role"), "agent-role-hint")} />
      <div className="agent-role-chips" role="group" aria-label="Suggested roles" id="agent-role-hint">
        {SUGGESTED_ROLES.map((role) => <button key={role} type="button" className="agent-chip" aria-pressed={draft.role === role} onClick={() => update({ role }, "role")}>{role}</button>)}
      </div>
      <FieldError field="role" message={shown("role")} />
      {draft.role.trim().length > ROLE_MAX - 10 && <p className="agent-form-count">{draft.role.trim().length} / {ROLE_MAX}</p>}
    </div>

    <InventoryChecklist field="tools" legend="Tools" hint="What the agent can do. Choose at least one tool or skill." items={ofType("tool")} selected={draft.tools}
      onChange={setTools} projectId={projectId} error={shown("tools") ?? shown("capabilities")} />

    <InventoryChecklist field="skills" legend="Skills" hint="Reusable workflows the agent can follow." items={ofType("skill")} selected={draft.skills}
      onChange={(skills) => update({ skills }, "skills", "capabilities")} projectId={projectId} error={shown("skills")} />

    <div className="agent-form-field">
      <label htmlFor={fieldId("model")}>Model <span className="agent-required">required</span></label>
      <select id={fieldId("model")} value={draft.model} onChange={(event) => update({ model: event.target.value }, "model")} {...controlProps("model", shown("model"))}>
        <option value="">Choose a model</option>
        {models.map((model) => {
          let label = model.name;
          if (model.isDefault) label += " (default)";
          if (!isUsable(model)) label += " (needs setup)";
          return <option key={model.id} value={model.id} disabled={!isUsable(model) && model.id !== draft.model}>{label}</option>;
        })}
        {draft.model && !models.some((model) => model.id === draft.model) && <option value={draft.model}>{draft.model} (removed)</option>}
      </select>
      <FieldError field="model" message={shown("model")} />
    </div>

    <ApprovalSwitches tools={draft.tools} approvals={draft.approvals} inventory={inventory} onChange={(approvals) => update({ approvals })} />

    <HandoffChecklist agents={otherAgents} selected={draft.handsWorkTo} onChange={(handsWorkTo) => update({ handsWorkTo }, "handsWorkTo")} error={shown("handsWorkTo")} />

    <div className="agent-form-field">
      <label htmlFor={fieldId("instructions")}>Instructions</label>
      <textarea id={fieldId("instructions")} rows={7} value={draft.instructions} maxLength={INSTRUCTIONS_MAX}
        placeholder="How the agent should work: its tone, what to check first, when to ask you."
        onChange={(event) => update({ instructions: event.target.value }, "instructions")} {...controlProps("instructions", shown("instructions"), "agent-instructions-count")} />
      <p className="agent-form-count" id="agent-instructions-count">{draft.instructions.length.toLocaleString("en")} / {INSTRUCTIONS_MAX.toLocaleString("en")} characters</p>
      <FieldError field="instructions" message={shown("instructions")} />
    </div>

    {failure && <p className="error" role="alert">{failure}</p>}
    <footer className="settings-footer agent-form-footer">
      {mode === "edit" && onDelete && <button type="button" className="map-reset agent-delete" onClick={() => void remove()} disabled={busy}>Delete agent</button>}
      <div className="settings-actions">
        <button type="button" className="map-reset" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="account-submit" aria-disabled={!valid || busy}>{submitLabel}</button>
      </div>
      {submitted && !valid && <p className="sr-only" role="alert">Some fields need attention. Focus moved to the first one.</p>}
    </footer>
  </form>;
}
