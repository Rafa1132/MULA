import assert from "node:assert/strict";
import test from "node:test";
import { contactLabel, hoursLeft, messageStatus, replyState } from "../services/inbox.ts";

test("inside the 24-hour window the owner replies freely", () => {
  assert.deepEqual(replyState({ opted_out: false, in_window: true }), { kind: "reply" });
});

test("after 24 hours only the approved template is offered", () => {
  const state = replyState({ opted_out: false, in_window: false });
  assert.equal(state.kind, "template");
  assert.match(state.reason, /24 hours/);
});

test("an opted-out customer can't be messaged at all", () => {
  assert.equal(replyState({ opted_out: true, in_window: true }).kind, "blocked");
  assert.equal(replyState({ opted_out: true, in_window: false }).kind, "blocked");
});

test("hours left counts down and stops when the window closes", () => {
  assert.equal(hoursLeft({ in_window: true, window_ends_at: 10_000 + 5 * 3600 + 59 }, 10_000), 5);
  assert.equal(hoursLeft({ in_window: false, window_ends_at: 0 }, 10_000), null);
});

test("contacts and delivery states read plainly", () => {
  assert.equal(contactLabel({ contact: "6281234", contact_name: " Budi " }), "Budi (+6281234)");
  assert.equal(contactLabel({ contact: "6281234", contact_name: "" }), "+6281234");
  assert.equal(messageStatus({ direction: "out", status: "failed", error: "Re-engagement message" }), "Not delivered: Re-engagement message");
  assert.equal(messageStatus({ direction: "out", status: "delivered", error: "" }), "Delivered");
  assert.equal(messageStatus({ direction: "in", status: "received", error: "" }), "");
});
