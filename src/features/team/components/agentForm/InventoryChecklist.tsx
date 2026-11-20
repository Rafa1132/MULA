import type { InventoryItem } from "@/features/inventory";
import { isUsable, setupLink, StatusPill } from "@/features/inventory";
import type { AgentField } from "../../services/agentForm";
import FieldError, { describedBy, fieldId } from "./FieldError";

type Props = {
  field: Extract<AgentField, "tools" | "skills">;
  legend: string;
  hint: string;
  // This workspace's items of the right type.
  items: InventoryItem[];
  selected: string[];
  onChange: (selected: string[]) => void;
  projectId: string;
  error?: string;
};

/**
 * A multi-select drawn only from the inventory. Items that aren't installed or connected are shown
 * disabled with a Set up link (it opens Inventory in a new tab, so the form isn't lost). A selected
 * item that has since been removed or broken stays listed and can be unchecked.
 */
export default function InventoryChecklist({ field, legend, hint, items, selected, onChange, projectId, error }: Props) {
  const known = new Set(items.map((entry) => entry.id));
  const removed = selected.filter((id) => !known.has(id));
  const hintId = `${fieldId(field)}-hint`;

  function toggle(id: string, checked: boolean) {
    if (checked) onChange([...selected, id]);
    else onChange(selected.filter((entry) => entry !== id));
  }

  return <fieldset className="agent-form-group" id={fieldId(field)} tabIndex={-1} {...describedBy(field, error, hintId)}>
    <legend>{legend}</legend>
    <p className="agent-form-hint" id={hintId}>{hint}</p>
    <ul className="agent-checklist">
      {items.map((entry) => {
        const isSelected = selected.includes(entry.id);
        const usable = isUsable(entry);
        const inputId = `${fieldId(field)}-${entry.id}`;
        return <li key={entry.id} data-disabled={!usable && !isSelected}>
          <input type="checkbox" id={inputId} checked={isSelected} disabled={!usable && !isSelected} onChange={(event) => toggle(entry.id, event.target.checked)} />
          <label htmlFor={inputId}><strong>{entry.name}</strong><span>{entry.description}</span></label>
          <span className="agent-checklist-end">
            <StatusPill status={entry.status} />
            {!usable && <a href={setupLink(projectId, entry.id)} target="_blank" rel="noopener">Set up<span className="sr-only"> {entry.name} (opens Inventory in a new tab)</span></a>}
          </span>
        </li>;
      })}
      {removed.map((id) => {
        const inputId = `${fieldId(field)}-${id}`;
        return <li key={id}>
          <input type="checkbox" id={inputId} checked onChange={() => toggle(id, false)} />
          <label htmlFor={inputId}><strong>{id}</strong><span>No longer in this workspace's inventory.</span></label>
          <span className="agent-checklist-end agent-removed">Removed</span>
        </li>;
      })}
    </ul>
    {items.length === 0 && removed.length === 0 && <p className="agent-form-hint">Nothing in the inventory yet.</p>}
    <FieldError field={field} message={error} />
  </fieldset>;
}
