import type { InventoryStatus } from "../types";
import { STATUS_LABELS } from "../services/inventory";

/** An item's status as a dot and a word, so it never relies on colour alone. */
export default function StatusPill({ status }: { status: InventoryStatus }) {
  return <span className="inventory-status" data-status={status}><span className="inventory-dot" aria-hidden="true" />{STATUS_LABELS[status]}</span>;
}
