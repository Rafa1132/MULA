import type { InventoryItem } from "../types";
import { itemAnchor, SOURCE_LABELS } from "../services/inventory";
import StatusPill from "./StatusPill";

type Props = { item: InventoryItem; highlighted: boolean };

/** One inventory item: name, status, source, what it does and what it needs. */
export default function InventoryItemCard({ item, highlighted }: Props) {
  const anchor = itemAnchor(item.id);
  return <article className="inventory-card" id={anchor} tabIndex={-1} aria-labelledby={`${anchor}-name`} data-highlighted={highlighted}>
    <header className="inventory-card-head">
      <h3 id={`${anchor}-name`}>{item.name}</h3>
      <StatusPill status={item.status} />
    </header>
    <p className="inventory-card-description">{item.description}</p>
    <p className="inventory-card-meta">
      <span>{SOURCE_LABELS[item.source]}</span>
      {item.isDefault && <span>Default model</span>}
      {item.sample && <span className="inventory-sample">Sample</span>}
    </p>
    {item.config.length > 0 && <div className="inventory-config">
      <h4>Needs</h4>
      <ul>{item.config.map((field) => <li key={field.key}>{field.label}{!field.required && " (optional)"}{field.secret && <span className="sr-only"> (kept secret)</span>}</li>)}</ul>
    </div>}
    {item.setupHint && <p className="inventory-setup">{item.setupHint}</p>}
  </article>;
}
