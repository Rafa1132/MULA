import type { InventoryItem } from "@/features/inventory";

type Props = {
  tools: string[];
  approvals: Record<string, boolean>;
  inventory: InventoryItem[];
  onChange: (approvals: Record<string, boolean>) => void;
};

/** One "Require owner approval" switch per selected tool. Defaults come from approvalsFor(). */
export default function ApprovalSwitches({ tools, approvals, inventory, onChange }: Props) {
  const names = new Map(inventory.map((entry) => [entry.id, entry.name]));
  return <fieldset className="agent-form-group">
    <legend>Permissions</legend>
    <p className="agent-form-hint">Approval starts on for tools that send messages, move money or change data. The agent asks you before each use.</p>
    {tools.length === 0 && <p className="agent-form-hint">Choose a tool to set its permission.</p>}
    <ul className="agent-switches">
      {tools.map((tool) => {
        const id = `agent-approval-${tool}`;
        const name = names.get(tool) ?? tool;
        return <li key={tool}>
          <label htmlFor={id}>{name}<span>Require owner approval</span></label>
          <input type="checkbox" role="switch" id={id} className="agent-switch" checked={approvals[tool] === true}
            onChange={(event) => onChange({ ...approvals, [tool]: event.target.checked })} />
        </li>;
      })}
    </ul>
  </fieldset>;
}
