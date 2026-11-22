import assert from "node:assert/strict";
import test from "node:test";
import { channelItems, inventoryFromTeam, isUsable, KNOWLEDGE_ITEM, WHATSAPP_ITEM } from "../services/inventory.ts";
import { cleanConnectDraft, connectErrors, emptyConnectDraft } from "../services/whatsapp.ts";
import { TEAM, WORKSPACE } from "./fixtures.mjs";

const NOT_CONNECTED = { connected: false, secrets_ready: true, public_url_set: true };
const CONNECTED = { ...NOT_CONNECTED, connected: true, phone_number_id: "1000000001", verified_at: null };

function items(whatsapp, knowledgeEntries) {
  const byId = new Map(channelItems({ whatsapp, knowledgeEntries }, WORKSPACE).map((item) => [item.id, item]));
  return { whatsapp: byId.get(WHATSAPP_ITEM), knowledge: byId.get(KNOWLEDGE_ITEM) };
}

test("WhatsApp is a real connector whose status follows the connection", () => {
  assert.equal(items(NOT_CONNECTED, 0).whatsapp.status, "needs_setup");
  assert.match(items({ ...NOT_CONNECTED, secrets_ready: false }, 0).whatsapp.setupHint, /MULA_SECRET_KEY/);
  const connected = items(CONNECTED, 0).whatsapp;
  assert.ok(isUsable(connected));
  assert.match(connected.setupHint, /verify token/, "an unverified webhook says what is left to do");
  assert.equal(items({ ...CONNECTED, verified_at: 1 }, 0).whatsapp.setupHint, "");
  assert.equal(items(null, 0).whatsapp.status, "error", "a failed read is shown, not hidden");
  assert.deepEqual(connected.sideEffects, ["sends_messages"]);
  assert.ok(connected.config.filter((field) => field.secret).every((field) => ["access_token", "app_secret"].includes(field.key)));
  assert.equal(connected.sample, false);
});

test("the knowledge base is listed with its size, and empty means needs setup", () => {
  assert.equal(items(NOT_CONNECTED, 0).knowledge.status, "needs_setup");
  const filled = items(NOT_CONNECTED, 3).knowledge;
  assert.equal(filled.status, "installed");
  assert.match(filled.description, /^3 entries/);
  assert.match(items(NOT_CONNECTED, 1).knowledge.description, /^1 entry:/);
  assert.equal(items(NOT_CONNECTED, null).knowledge.status, "error");
});

test("the inventory includes them only when the channel state was read", () => {
  assert.ok(!inventoryFromTeam(TEAM, WORKSPACE).some((item) => item.id === WHATSAPP_ITEM));
  const all = inventoryFromTeam(TEAM, WORKSPACE, { whatsapp: CONNECTED, knowledgeEntries: 2 });
  assert.ok(all.some((item) => item.id === WHATSAPP_ITEM) && all.some((item) => item.id === KNOWLEDGE_ITEM));
});

test("the connect form checks Meta's values before sending them", () => {
  assert.deepEqual(Object.keys(connectErrors(emptyConnectDraft())).sort(), ["access_token", "app_secret", "phone_number_id", "waba_id"]);
  const good = { phone_number_id: " 1000000001 ", waba_id: "2000000001", access_token: "EAAG" + "x".repeat(30), app_secret: "s".repeat(32), reopen_template: "", reopen_language: "" };
  assert.deepEqual(connectErrors(good), {});
  assert.equal(cleanConnectDraft(good).phone_number_id, "1000000001");
  assert.ok(connectErrors({ ...good, access_token: "EAAG token with spaces 12345" }).access_token);
  assert.ok(connectErrors({ ...good, reopen_template: "hello_again" }).reopen_language, "a template needs its language");
  assert.deepEqual(connectErrors({ ...good, reopen_template: "hello_again", reopen_language: "en_US" }), {});
});
