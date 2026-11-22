import assert from "node:assert/strict";
import test from "node:test";
import { channelOptions, parseAllowlist, templateDraft, templatePayload, validateTemplate } from "../services/templates.ts";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const TEMPLATE = {
  id: "customer_service", name: "Customer Service", description: "Answers your customers.", role: "Customer Service",
  prompt: "Greet customers warmly.", tools: { knowledge_read: "Answer from the knowledge base", handoff: "Hand off to a person" },
  approvals: { knowledge_read: false, handoff: false }, tone: "friendly", channels: ["whatsapp"],
};

function whatsapp(status, workspaceId = WORKSPACE) {
  return { id: "connector:whatsapp", workspaceId, type: "connector", status, name: "WhatsApp Business", source: "built-in", description: "", config: [], setupHint: "", sideEffects: ["sends_messages"], isDefault: false, sample: false };
}

test("WhatsApp can be chosen only once this workspace has connected it", () => {
  assert.equal(channelOptions([], WORKSPACE)[0].available, false);
  assert.equal(channelOptions([whatsapp("needs_setup")], WORKSPACE)[0].available, false);
  assert.equal(channelOptions([whatsapp("connected", "another-workspace")], WORKSPACE)[0].available, false);
  assert.equal(channelOptions([whatsapp("connected")], WORKSPACE)[0].available, true);
});

test("the template starts with its own tools, tone and approvals, and only working channels", () => {
  const unconnected = templateDraft(TEMPLATE, "qwen", channelOptions([], WORKSPACE));
  assert.deepEqual(unconnected, { prompt: "Greet customers warmly.", tools: ["knowledge_read", "handoff"], brain: "qwen", tone: "friendly", channels: [] });
  assert.deepEqual(templateDraft(TEMPLATE, "qwen", channelOptions([whatsapp("connected")], WORKSPACE)).channels, ["whatsapp"]);
  // No tool of this template moves money, changes orders or shares files, so none waits for approval.
  assert.ok(Object.values(TEMPLATE.approvals).every((needsApproval) => needsApproval === false));
});

test("the form refuses unknown tools, brains and channels that aren't connected", () => {
  const channels = channelOptions([], WORKSPACE);
  const draft = templateDraft(TEMPLATE, "qwen", channels);
  assert.deepEqual(validateTemplate(draft, TEMPLATE, ["qwen"], channels), {});
  assert.ok(validateTemplate({ ...draft, tools: [] }, TEMPLATE, ["qwen"], channels).tools);
  assert.ok(validateTemplate({ ...draft, tools: ["refund_order"] }, TEMPLATE, ["qwen"], channels).tools);
  assert.ok(validateTemplate({ ...draft, brain: "gpt" }, TEMPLATE, ["qwen"], channels).brain);
  assert.ok(validateTemplate({ ...draft, channels: ["whatsapp"] }, TEMPLATE, ["qwen"], channels).channels);
});

test("the payload matches the server's TemplateInput, with the allowlist off", () => {
  const draft = { prompt: "  Be kind. ", tools: ["knowledge_read"], brain: "qwen", tone: "concise", channels: ["whatsapp"] };
  assert.deepEqual(templatePayload(draft), {
    prompt: "Be kind.", tools: ["knowledge_read"], brain: "qwen",
    support: { tone: "concise", whatsapp_enabled: true, allowlist_enabled: false, allowlist: [] },
  });
});

test("allowlist numbers are normalised and mistakes are named", () => {
  assert.deepEqual(parseAllowlist("+62 812-3456-7890\n6281234567890, 628111111111\n\n"), { numbers: ["6281234567890", "628111111111"], invalid: [] });
  assert.deepEqual(parseAllowlist("Budi\n12").invalid, ["Budi", "12"]);
});
