// The workspace inventory: everything a project owns or has installed. Pages read it only through
// listInventory(), so it can later come from its own API (for example GET /api/inventory) without
// changing the Inventory page or the Add agent form.
//
// Today it is built from what the server already sends in /api/team (each agent's tools, the runtime
// toolsets its file offers, and the brains the app supports), plus the WhatsApp connection
// (/api/channels/whatsapp) and the knowledge base (/api/knowledge). Skills and the other connectors
// don't exist in Mula yet, so a few labelled samples show what they will look like; samples can't be
// set up or chosen.
import type { InventoryFilter, InventoryItem, InventoryStatus, InventoryType, SideEffect } from "../types.ts";
import { projectFetch, projectPath } from "../../../common/services/project.ts";
import { toolInfo, toolsetInfo } from "../../team/services/tools.ts";
import type { WhatsAppStatus } from "./whatsapp.ts";

// The parts of a /api/team agent the inventory reads. Kept local so this feature doesn't depend on
// the whole team Agent type.
export type TeamAgentShape = {
  id: string;
  name: string;
  brain: string;
  available_tools: Record<string, string>;
  available_toolsets: string[];
  toolset_status: Record<string, { status: "ready" | "paid" | "needs_setup"; note: string }>;
  available_brains: Record<string, {
    name: string;
    description: string;
    location: "local" | "cloud";
    host: string;
    setup_script?: string;
    setup_key?: string;
    status: "ready" | "needs_setup" | "unchecked";
  }>;
};

export const TYPE_ORDER: InventoryType[] = ["tool", "skill", "connector", "knowledge", "model"];
export const TYPE_LABELS: Record<InventoryType, string> = { tool: "Tools", skill: "Skills", connector: "Connectors", knowledge: "Knowledge", model: "Models" };

// The two real (non-sample) items that aren't tools or models.
export const WHATSAPP_ITEM = "connector:whatsapp";
export const KNOWLEDGE_ITEM = "knowledge:base";

/** What listInventory read besides /api/team. null means that read failed. */
export type ChannelState = { whatsapp: WhatsAppStatus | null; knowledgeEntries: number | null };
export const STATUS_ORDER: InventoryStatus[] = ["installed", "connected", "needs_setup", "error"];
export const STATUS_LABELS: Record<InventoryStatus, string> = { installed: "Installed", connected: "Connected", needs_setup: "Needs setup", error: "Error" };
export const SOURCE_LABELS: Record<InventoryItem["source"], string> = { "built-in": "Built-in", marketplace: "Marketplace", custom: "Custom" };

// What the server's tools can change. Only memory_write changes anything today; the forecasting
// methods and csv_read only read.
const TOOL_SIDE_EFFECTS: Record<string, SideEffect[]> = { memory_write: ["changes_data"] };

/** Ids carry a prefix per kind of source so a tool and a toolset or model can never share one. */
export function toolsetItemId(toolset: string) {
  return `toolset:${toolset}`;
}
export function modelItemId(brain: string) {
  return `model:${brain}`;
}

function item(workspaceId: string, fields: Partial<InventoryItem> & Pick<InventoryItem, "id" | "name" | "type" | "status" | "source" | "description">): InventoryItem {
  return { workspaceId, config: [], setupHint: "", sideEffects: [], isDefault: false, sample: false, ...fields };
}

function toolItems(agents: TeamAgentShape[], workspaceId: string): InventoryItem[] {
  const names = new Map<string, string>();
  for (const agent of agents) {
    for (const [id, name] of Object.entries(agent.available_tools ?? {})) {
      if (!names.has(id)) names.set(id, name);
    }
  }
  return [...names].map(([id, name]) => item(workspaceId, {
    id, name, type: "tool", status: "installed", source: "built-in",
    description: toolInfo(id).description, sideEffects: TOOL_SIDE_EFFECTS[id] ?? [],
  }));
}

function toolsetItems(agents: TeamAgentShape[], workspaceId: string): InventoryItem[] {
  const seen = new Map<string, InventoryItem>();
  for (const agent of agents) {
    for (const toolset of agent.available_toolsets ?? []) {
      if (seen.has(toolset)) continue;
      const readiness = agent.toolset_status?.[toolset];
      let status: InventoryStatus = "installed";
      let setupHint = "";
      if (readiness && readiness.status === "needs_setup") {
        status = "needs_setup";
        setupHint = readiness.note;
      }
      // A note says what the toolset does or, while it needs setup, what is missing (the setup hint).
      let description = "One of the runtime's own tools, switched on per agent.";
      if (readiness && readiness.note && status !== "needs_setup") description = readiness.note;
      seen.set(toolset, item(workspaceId, {
        id: toolsetItemId(toolset), name: toolsetInfo(toolset).name, type: "tool", status, source: "built-in", description, setupHint,
      }));
    }
  }
  return [...seen.values()];
}

function modelItems(agents: TeamAgentShape[], workspaceId: string): InventoryItem[] {
  const brains = new Map<string, TeamAgentShape["available_brains"][string]>();
  for (const agent of agents) {
    for (const [id, brain] of Object.entries(agent.available_brains ?? {})) {
      if (!brains.has(id)) brains.set(id, brain);
    }
  }
  const items = [...brains].map(([id, brain]) => {
    // Local brains are installed; cloud ones are connected accounts. "unchecked" means the runtime
    // couldn't be asked just now, which is not a failure of the brain itself, so it stays usable.
    let status: InventoryStatus = "installed";
    if (brain.location === "cloud") status = "connected";
    if (brain.status === "needs_setup") status = "needs_setup";
    const config = [];
    if (brain.setup_key) config.push({ key: brain.setup_key, label: `${brain.host} API key`, required: true, secret: true });
    let setupHint = "";
    if (brain.status === "needs_setup" && brain.setup_script) setupHint = `Run server/scripts/${brain.setup_script} on the computer running Mula.`;
    return item(workspaceId, {
      id: modelItemId(id), name: brain.name, type: "model", status, source: "built-in",
      description: `${brain.description} Messages go to ${brain.host}.`, config, setupHint,
    });
  });
  markDefaultModel(items, agents);
  return items;
}

// The default model is the Operator's brain, the one the project already talks to; without an
// Operator it is the first usable model.
function markDefaultModel(models: InventoryItem[], agents: TeamAgentShape[]) {
  const operator = agents.find((agent) => agent.id === "operator");
  let chosen: InventoryItem | undefined;
  if (operator) chosen = models.find((model) => model.id === modelItemId(operator.brain) && isUsable(model));
  if (!chosen) chosen = models.find(isUsable);
  if (chosen) chosen.isDefault = true;
}

const SIGN_IN = (service: string) => [{ key: "account", label: `${service} account sign-in`, required: true, secret: true }];
const NOT_YET = "Not available in Mula yet.";

/** Samples of what the inventory will hold. They are listed so the shape is clear, never usable. */
export function sampleItems(workspaceId: string): InventoryItem[] {
  type SampleFields = Partial<InventoryItem> & Pick<InventoryItem, "id" | "name" | "type" | "description">;
  const sample = (fields: SampleFields) => item(workspaceId, { setupHint: NOT_YET, ...fields, status: "needs_setup", source: "marketplace", sample: true });
  return [
    sample({ id: "sample:pdf_merge", name: "PDF merge", type: "tool", description: "Combines several PDFs into one file." }),
    sample({ id: "sample:spreadsheet_edit", name: "Spreadsheet edit", type: "tool", description: "Updates cells and rows in a spreadsheet.", sideEffects: ["changes_data"] }),
    sample({ id: "sample:monthly_stock_report", name: "Monthly stock report", type: "skill", description: "Counts stock on hand each month and flags items running low." }),
    sample({ id: "sample:weekly_sales_summary", name: "Weekly sales summary", type: "skill", description: "Summarises last week's sales against the week before." }),
    sample({ id: "sample:google_docs", name: "Google Docs", type: "connector", description: "Reads and writes documents in your Google account.", config: SIGN_IN("Google") }),
    sample({ id: "sample:excel", name: "Microsoft Excel", type: "connector", description: "Opens workbooks stored in your Microsoft 365 account.", config: SIGN_IN("Microsoft") }),
    sample({ id: "sample:shopify", name: "Shopify", type: "connector", description: "Reads orders and products from your Shopify store.", config: SIGN_IN("Shopify"), sideEffects: ["changes_data"] }),
  ];
}

function whatsappItem(status: WhatsAppStatus | null, workspaceId: string): InventoryItem {
  const fields = {
    id: WHATSAPP_ITEM, name: "WhatsApp Business", type: "connector" as const, source: "built-in" as const, sideEffects: ["sends_messages" as const],
    config: [
      { key: "phone_number_id", label: "Phone Number ID", required: true, secret: false },
      { key: "waba_id", label: "WhatsApp Business Account ID", required: true, secret: false },
      { key: "access_token", label: "Permanent access token", required: true, secret: true },
      { key: "app_secret", label: "App secret", required: true, secret: true },
    ],
  };
  const description = "Customers message your WhatsApp Business number and Customer Service answers from your knowledge base.";
  if (status === null) {
    return item(workspaceId, { ...fields, status: "error", description, setupHint: "Mula couldn't read the WhatsApp connection. Reload the page to try again." });
  }
  if (!status.connected) {
    let setupHint = "Connect your number with the values from Meta's dashboard.";
    if (!status.secrets_ready) setupHint = "The server needs MULA_SECRET_KEY before a number can be connected (see docker/README.md).";
    return item(workspaceId, { ...fields, status: "needs_setup", description, setupHint });
  }
  let setupHint = "";
  if (!status.verified_at) setupHint = "Meta hasn't checked the webhook yet: paste the webhook URL and verify token into WhatsApp → Configuration.";
  return item(workspaceId, { ...fields, status: "connected", description, setupHint });
}

function knowledgeItem(entries: number | null, workspaceId: string): InventoryItem {
  const fields = { id: KNOWLEDGE_ITEM, name: "Knowledge base", type: "knowledge" as const, source: "custom" as const };
  if (entries === null) {
    return item(workspaceId, { ...fields, status: "error", description: "Products, prices, opening hours, FAQs and policies.", setupHint: "Mula couldn't read the knowledge base. Reload the page to try again." });
  }
  let count = `${entries} entries`;
  if (entries === 1) count = "1 entry";
  const description = `${count}: the only facts Customer Service tells customers.`;
  if (entries === 0) {
    return item(workspaceId, { ...fields, status: "needs_setup", description, setupHint: "Add your products, prices and opening hours. Until then every customer is handed to you." });
  }
  return item(workspaceId, { ...fields, status: "installed", description });
}

/** The WhatsApp connection and the knowledge base as inventory items. Pure, so it can be tested. */
export function channelItems(state: ChannelState, workspaceId: string): InventoryItem[] {
  return [whatsappItem(state.whatsapp, workspaceId), knowledgeItem(state.knowledgeEntries, workspaceId)];
}

/**
 * The whole inventory for a workspace, from the /api/team agents and, when given, the channel state.
 * Pure, so it can be tested.
 */
export function inventoryFromTeam(agents: TeamAgentShape[], workspaceId: string, channels?: ChannelState): InventoryItem[] {
  let extra: InventoryItem[] = [];
  if (channels) extra = channelItems(channels, workspaceId);
  return [
    ...toolItems(agents, workspaceId),
    ...toolsetItems(agents, workspaceId),
    ...extra,
    ...modelItems(agents, workspaceId),
    ...sampleItems(workspaceId),
  ];
}

/** Installed or connected: an agent may use it now. */
export function isUsable(entry: InventoryItem) {
  return entry.status === "installed" || entry.status === "connected";
}

export function filterInventory(items: InventoryItem[], filter: InventoryFilter): InventoryItem[] {
  const query = filter.query.trim().toLowerCase();
  return items.filter((entry) => {
    if (filter.type !== "all" && entry.type !== filter.type) return false;
    if (filter.status !== "all" && entry.status !== filter.status) return false;
    if (!query) return true;
    return [entry.name, entry.description, entry.id].some((text) => text.toLowerCase().includes(query));
  });
}

/** The items in TYPE_ORDER groups, leaving out empty groups. */
export function groupByType(items: InventoryItem[]) {
  return TYPE_ORDER
    .map((type) => ({ type, label: TYPE_LABELS[type], items: items.filter((entry) => entry.type === type) }))
    .filter((group) => group.items.length > 0);
}

export const EMPTY_FILTER: InventoryFilter = { type: "all", status: "all", query: "" };

/** The id of an item's card on the Inventory page. */
export function itemAnchor(id: string) {
  return `item-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/** Where a "Set up" link goes: the Inventory page, scrolled to and highlighting that item. */
export function setupLink(projectId: string, itemId: string) {
  return `${projectPath(projectId, "/inventory")}?item=${encodeURIComponent(itemId)}`;
}

/**
 * The service function every page uses. It reads the project from the page's URL (projectFetch),
 * like every other project call, and returns that workspace's inventory.
 */
export async function listInventory(workspaceId: string, signal?: AbortSignal): Promise<InventoryItem[]> {
  const [response, channels] = await Promise.all([
    projectFetch("/api/team", { cache: "no-store", signal }),
    readChannels(signal),
  ]);
  if (response.status === 401) throw new Error("Your session expired. Sign in again.");
  if (!response.ok) throw new Error("Could not load the inventory. Please try again.");
  const result = await response.json();
  if (!result || !Array.isArray(result.agents)) throw new Error("The server sent an inventory Mula can't read.");
  return inventoryFromTeam(result.agents, workspaceId, channels);
}

/** The WhatsApp status and the knowledge base's size. A failed read becomes null, shown as Error. */
async function readChannels(signal?: AbortSignal): Promise<ChannelState> {
  async function read(path: string) {
    try {
      const response = await projectFetch(path, { cache: "no-store", signal });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      // An abort (leaving the page) is passed on; anything else shows the item as Error.
      if (signal?.aborted) throw error;
      return null;
    }
  }
  const [whatsapp, knowledge] = await Promise.all([read("/api/channels/whatsapp"), read("/api/knowledge")]);
  let knowledgeEntries: number | null = null;
  if (knowledge && Array.isArray(knowledge.entries)) knowledgeEntries = knowledge.entries.length;
  let status: WhatsAppStatus | null = null;
  if (whatsapp && typeof whatsapp.connected === "boolean") status = whatsapp;
  return { whatsapp: status, knowledgeEntries };
}
