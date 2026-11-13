import assert from "node:assert/strict";
import test from "node:test";
import { attachRequests, placeRequest } from "../services/requests.ts";

function request(id, status, message_id = 2) {
  return { id, status, message_id, to_name: "Forecasting", question: "Forecast", approved_in_advance: false };
}

test("saved requests are shown under the reply that made them", () => {
  const messages = [{ id: "1" }, { id: "2" }];
  const placed = attachRequests(messages, [request("a", "answered"), request("b", "pending", 99), request("c", "pending", null)]);
  assert.equal(placed[0].requests, undefined);
  assert.deepEqual(placed[1].requests.map((item) => item.id), ["a"]);
});

test("a request update replaces the card instead of adding another", () => {
  let messages = placeRequest([{ id: "reply" }, { id: "relay" }], "reply", request("a", "pending"));
  messages = placeRequest(messages, "relay", request("a", "running"));
  assert.equal(messages[0].requests[0].status, "running");
  assert.equal(messages[1].requests, undefined);
});
