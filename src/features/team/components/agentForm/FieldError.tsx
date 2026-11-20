import type { AgentField } from "../../services/agentForm";

/** The id of a field's element, so focus can move to the first error. */
export function fieldId(field: AgentField) {
  return `agent-${field}`;
}

export function errorId(field: AgentField) {
  return `agent-${field}-error`;
}

/** Links a field or group to its hint and error for assistive tech. */
export function describedBy(field: AgentField, error: string | undefined, hint?: string) {
  const ids = [hint, error && errorId(field)].filter(Boolean).join(" ");
  if (!ids) return {};
  return { "aria-describedby": ids };
}

/** describedBy plus aria-invalid, for single controls (inputs, selects, text areas). */
export function controlProps(field: AgentField, error: string | undefined, hint?: string) {
  if (!error) return describedBy(field, error, hint);
  return { ...describedBy(field, error, hint), "aria-invalid": true };
}

export default function FieldError({ field, message }: { field: AgentField; message: string | undefined }) {
  if (!message) return null;
  return <p className="agent-form-error" id={errorId(field)}>{message}</p>;
}
