import assert from "node:assert/strict";
import test from "node:test";
import { addCard, archiveCard, CARD_ID, cleanDraft, loadCard, readError, startCard } from "../services/board.ts";

const PROJECT = "6d5c2141-efd5-40d9-8327-8f4dd8a1736f";

function withPage(calls, answer) {
  globalThis.window = { location: { pathname: `/projects/${PROJECT}/board` } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return answer();
  };
}

test("card ids are the runtime's; anything else never builds a URL", async () => {
  assert.ok(CARD_ID.test("t_ae9b8693"));
  for (const bad of ["t_xyz", "x_ae9b8693", "t_ae9b8693/../x", "t_AE9B8693", ""]) assert.equal(CARD_ID.test(bad), false, bad);
  const calls = [];
  withPage(calls, () => Response.json({}));
  await assert.rejects(loadCard("../../api/team"), /isn't on this board/);
  assert.equal(calls.length, 0);
});

test("calls carry the page's project, and Start is a POST to the card's start", async () => {
  const calls = [];
  withPage(calls, () => Response.json({ id: "t_ae9b8693" }));
  await startCard("t_ae9b8693");
  assert.equal(calls[0].url, "/api/board/cards/t_ae9b8693/start");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(new Headers(calls[0].init.headers).get("X-Mula-Project"), PROJECT);
});

test("a new card sends trimmed text, and no agent as null", async () => {
  assert.deepEqual(cleanDraft({ title: "  Restock  ", notes: " five ", agent: "" }), { title: "Restock", notes: "five", agent: null });
  const calls = [];
  withPage(calls, () => Response.json({ id: "t_ae9b8693" }, { status: 201 }));
  await addCard({ title: " Order boxes ", notes: "", agent: "operator" });
  assert.deepEqual(JSON.parse(calls[0].init.body), { title: "Order boxes", notes: "", agent: "operator" });
});

test("archive accepts an empty 204 answer", async () => {
  const calls = [];
  withPage(calls, () => new Response(null, { status: 204 }));
  await archiveCard("t_ae9b8693");
  assert.equal(calls[0].url, "/api/board/cards/t_ae9b8693/archive");
});

test("errors show the server's message, or a readable fallback", async () => {
  assert.equal(await readError(Response.json({ detail: "Choose an agent for this card first." }, { status: 409 })), "Choose an agent for this card first.");
  assert.equal(await readError(new Response("<html>", { status: 502 })), "The Board couldn't do that. Please try again.");
  assert.equal(await readError(Response.json({ detail: "Not Found" }, { status: 404 })), "The Board couldn't do that. Please try again.");
  assert.match(await readError(new Response("", { status: 401 })), /session expired/);
});
