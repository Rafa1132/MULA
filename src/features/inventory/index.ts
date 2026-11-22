export { default as InventoryPage } from "./components/InventoryPage";
export type { ConfigField, InventoryFilter, InventoryItem, InventoryReferences, InventorySource, InventoryStatus, InventoryType, SideEffect } from "./types";
export { isUsable, KNOWLEDGE_ITEM, listInventory, setupLink, STATUS_LABELS, TYPE_LABELS, WHATSAPP_ITEM } from "./services/inventory";
export { default as StatusPill } from "./components/StatusPill";
export { describeIssue, findInWorkspace, referenceIssues, warningText } from "./services/correlation";
export type { ReferenceIssue } from "./services/correlation";
