// Server agents added from a template (server/agents/*.md with `template: true`), for now Customer
// Service. Unlike agents made with the blank Add agent form (workspaceAgents.ts, browser only),
// a template agent runs on the server, so the form posts it to /api/team/templates/<id>.
import type { InventoryItem } from "../../inventory/types.ts";
import { isUsable, WHATSAPP_ITEM } from "../../inventory/services/inventory.ts";
import { teamRequest } from "./team.ts";
import { projectFetch } from "../../../common/services/project.ts";
import { readError } from "../../../common/services/readError.ts";
import type { Agent } from "./team.ts";

export type Tone = "friendly" | "professional" | "concise";
export type ChannelId = "whatsapp";

/** What /api/team lists under `templates`: a template the project hasn't added yet. */
export type AgentTemplate = {
  id: string;
  name: string;
  description: string;
  role: string;
  prompt: string;
  // The template's capabilities: switch id → label.
  tools: Record<string, string>;
  // Whether each tool waits for the owner's approval. None of Customer Service's tools moves
  // money, changes orders or shares files, so none waits; such requests become handoff tickets.
  approvals: Record<string, boolean>;
  tone: Tone;
  channels: ChannelId[];
};

export type SupportSettings = {
  tone: Tone;
  whatsapp_enabled: boolean;
  allowlist_enabled: boolean;
  allowlist: string[];
};

export type TemplateDraft = {
  prompt: string;
  tools: string[];
  brain: string;
  tone: Tone;
  channels: ChannelId[];
};

export const TONE_LABELS: Record<Tone, string> = { friendly: "Friendly", professional: "Professional", concise: "Concise" };
export const TONES: Tone[] = ["friendly", "professional", "concise"];
export const PROMPT_MAX = 4000;
// The same limit as the server's SupportInput.allowlist.
export const ALLOWLIST_MAX = 200;

/** A channel the template can answer on, and whether this workspace can use it yet. */
export type ChannelOption = { id: ChannelId; name: string; available: boolean; hint: string };

export function channelOptions(inventory: InventoryItem[], workspaceId: string): ChannelOption[] {
  const whatsapp = inventory.find((item) => item.id === WHATSAPP_ITEM && item.workspaceId === workspaceId);
  let available = false;
  let hint = "Connect a WhatsApp Business number in Inventory first.";
  if (whatsapp && isUsable(whatsapp)) {
    available = true;
    hint = "Customers' WhatsApp messages are answered by this agent.";
  }
  return [{ id: "whatsapp", name: "WhatsApp", available, hint }];
}

/** The form's starting values: the template's own, with channels only where they can work. */
export function templateDraft(template: AgentTemplate, brain: string, channels: ChannelOption[]): TemplateDraft {
  const usable = new Set(channels.filter((channel) => channel.available).map((channel) => channel.id));
  return {
    prompt: template.prompt,
    tools: Object.keys(template.tools),
    brain,
    tone: template.tone,
    channels: template.channels.filter((channel) => usable.has(channel)),
  };
}

export type TemplateErrors = Partial<Record<"prompt" | "tools" | "brain" | "channels", string>>;

export function validateTemplate(draft: TemplateDraft, template: AgentTemplate, brains: string[], channels: ChannelOption[]): TemplateErrors {
  const errors: TemplateErrors = {};
  if (draft.prompt.length > PROMPT_MAX) errors.prompt = `Use at most ${PROMPT_MAX.toLocaleString("en")} characters.`;
  if (draft.tools.length === 0) errors.tools = "Keep at least one tool switched on.";
  if (draft.tools.some((tool) => !(tool in template.tools))) errors.tools = "Only the template's own tools can be switched on.";
  if (!brains.includes(draft.brain)) errors.brain = "Choose one of the listed brains.";
  const unavailable = draft.channels.find((id) => !channels.some((channel) => channel.id === id && channel.available));
  if (unavailable) errors.channels = "That channel isn't connected yet. Connect it in Inventory, or switch it off.";
  return errors;
}

/** The body for POST /api/team/templates/<id>. The allowlist starts off; it is set in the agent's tab. */
export function templatePayload(draft: TemplateDraft) {
  return {
    prompt: draft.prompt.trim(), tools: draft.tools, brain: draft.brain,
    support: { tone: draft.tone, whatsapp_enabled: draft.channels.includes("whatsapp"), allowlist_enabled: false, allowlist: [] },
  };
}

/** Allowlist text (one number per line or comma separated) as the numbers the server expects. */
export function parseAllowlist(text: string): { numbers: string[]; invalid: string[] } {
  const numbers: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\n,]/)) {
    const raw = part.trim();
    if (!raw) continue;
    const digits = raw.replace(/^\+/, "").replace(/[\s-]/g, "");
    if (!/^[0-9]{6,15}$/.test(digits)) invalid.push(raw);
    else if (!numbers.includes(digits)) numbers.push(digits);
  }
  return { numbers, invalid };
}

export async function addTemplateAgent(templateId: string, draft: TemplateDraft): Promise<Agent> {
  return teamRequest(`/api/team/templates/${encodeURIComponent(templateId)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(templatePayload(draft)),
  });
}

/** Removes the agent from the project. The answer is 204 with no body, so teamRequest (which reads JSON) isn't used. */
export async function removeTemplateAgent(agentId: string): Promise<void> {
  const response = await projectFetch(`/api/team/${encodeURIComponent(agentId)}`, { method: "DELETE", cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Could not remove the agent. Please try again."));
}

export async function saveSupport(agentId: string, settings: SupportSettings): Promise<SupportSettings> {
  return teamRequest(`/api/team/${encodeURIComponent(agentId)}/support`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
  });
}
