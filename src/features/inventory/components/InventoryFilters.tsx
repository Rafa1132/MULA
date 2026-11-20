import type { InventoryFilter, InventoryStatus, InventoryType } from "../types";
import { STATUS_LABELS, STATUS_ORDER, TYPE_LABELS, TYPE_ORDER } from "../services/inventory";

type Props = {
  filter: InventoryFilter;
  onChange: (filter: InventoryFilter) => void;
  shown: number;
  total: number;
};

/** Search plus type and status filters. The result count is announced as it changes. */
export default function InventoryFilters({ filter, onChange, shown, total }: Props) {
  return <div className="inventory-filters" role="search" aria-label="Filter the inventory">
    <label className="inventory-field inventory-search">
      <span>Search</span>
      <input type="search" value={filter.query} placeholder="Name or description" onChange={(event) => onChange({ ...filter, query: event.target.value })} />
    </label>
    <label className="inventory-field">
      <span>Type</span>
      <select value={filter.type} onChange={(event) => onChange({ ...filter, type: event.target.value as InventoryType | "all" })}>
        <option value="all">All types</option>
        {TYPE_ORDER.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
      </select>
    </label>
    <label className="inventory-field">
      <span>Status</span>
      <select value={filter.status} onChange={(event) => onChange({ ...filter, status: event.target.value as InventoryStatus | "all" })}>
        <option value="all">Any status</option>
        {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
      </select>
    </label>
    <p className="inventory-count" role="status">{shown} of {total} items</p>
  </div>;
}
