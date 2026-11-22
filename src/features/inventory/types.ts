// What a workspace (a project) owns or has installed. The Inventory page lists these, and the Add
// agent form in features/team picks from them, so both pages share these types.

// "knowledge" is the project's knowledge base (features/knowledge), which Customer Service answers from.
export type InventoryType = "tool" | "skill" | "connector" | "knowledge" | "model";
export type InventoryStatus = "installed" | "connected" | "needs_setup" | "error";
export type InventorySource = "built-in" | "marketplace" | "custom";

// Something a tool can do that the owner should be able to approve first. Tools with any of these
// start with "Require owner approval" switched on in the Add agent form.
export type SideEffect = "sends_messages" | "moves_money" | "changes_data";

/** One setting an item needs before it can be used, such as an API key or an account sign-in. */
export type ConfigField = {
  key: string;
  label: string;
  required: boolean;
  // Secrets are never shown or stored in the browser; the field only says that one is needed.
  secret: boolean;
};

export type InventoryItem = {
  id: string;
  // The project the item belongs to. An agent may only use items from its own workspace.
  workspaceId: string;
  name: string;
  type: InventoryType;
  status: InventoryStatus;
  source: InventorySource;
  description: string;
  config: ConfigField[];
  // How to finish setting the item up, when it needs setup (for example a script to run).
  setupHint: string;
  sideEffects: SideEffect[];
  // Models only: the one new agents start with.
  isDefault: boolean;
  // A sample of what the inventory will hold. It is listed, but can't be set up in Mula yet.
  sample: boolean;
};

/** The inventory items an agent uses. Workspace agents (features/team) carry these fields. */
export type InventoryReferences = {
  tools: string[];
  skills: string[];
  model: string;
};

export type InventoryFilter = {
  type: InventoryType | "all";
  status: InventoryStatus | "all";
  query: string;
};
