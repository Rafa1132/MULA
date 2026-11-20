import type { AgentSummary } from "../../services/agentForm";
import FieldError, { describedBy, fieldId } from "./FieldError";

type Props = {
  agents: AgentSummary[];
  selected: string[];
  onChange: (selected: string[]) => void;
  error?: string;
};

/** Optional: other agents this one may hand work to. A deleted agent stays listed until unchecked. */
export default function HandoffChecklist({ agents, selected, onChange, error }: Props) {
  const known = new Set(agents.map((agent) => agent.id));
  const rows = [...agents, ...selected.filter((id) => !known.has(id)).map((id) => ({ id, name: `${id} (deleted)` }))];
  const hintId = `${fieldId("handsWorkTo")}-hint`;

  function toggle(id: string, checked: boolean) {
    if (checked) onChange([...selected, id]);
    else onChange(selected.filter((entry) => entry !== id));
  }

  return <fieldset className="agent-form-group" id={fieldId("handsWorkTo")} tabIndex={-1} {...describedBy("handsWorkTo", error, hintId)}>
    <legend>Hands work to <span className="agent-optional">optional</span></legend>
    <p className="agent-form-hint" id={hintId}>Agents it may pass work to. They become lines on the My agents map once Mula runs this agent.</p>
    {rows.length === 0 && <p className="agent-form-hint">There are no other agents yet.</p>}
    <ul className="agent-checklist compact">
      {rows.map((agent) => {
        const inputId = `${fieldId("handsWorkTo")}-${agent.id}`;
        return <li key={agent.id}>
          <input type="checkbox" id={inputId} checked={selected.includes(agent.id)} onChange={(event) => toggle(agent.id, event.target.checked)} />
          <label htmlFor={inputId}><strong>{agent.name}</strong></label>
        </li>;
      })}
    </ul>
    <FieldError field="handsWorkTo" message={error} />
  </fieldset>;
}
