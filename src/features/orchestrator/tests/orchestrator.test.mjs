import assert from "node:assert/strict";
import test from "node:test";
import { AssistantError, answerQuestion, confirmProposal, confirmSummary, fetchOnboarding, onboardingTranscript, proposalsByMessage } from "../services/orchestrator.ts";

const BASE = {
  status: "active", finished: null, greeting: "Hi, I'm Mula.",
  questions: [
    { id: "name", question: "What should I call you?", placeholder: "" },
    { id: "business", question: "What does your business do?", placeholder: "" },
    { id: "help", question: "What would you like help with first?", placeholder: "" },
    { id: "style", question: "How do you like answers?", placeholder: "" },
  ],
  about: { name: "Rafa", business: null, help: null, style: null },
  personality: null, personality_options: {},
};

test("the transcript shows the greeting and each question already passed, with its answer or Skipped", () => {
  assert.deepEqual(onboardingTranscript({ ...BASE, step: "name" }), [{ from: "assistant", text: "Hi, I'm Mula." }]);
  assert.deepEqual(onboardingTranscript({ ...BASE, step: "help" }).slice(1), [
    { from: "assistant", text: "What should I call you?" },
    { from: "user", text: "Rafa" },
    { from: "assistant", text: "What does your business do?" },
    { from: "user", text: "Skipped", skipped: true },
  ]);
  assert.equal(onboardingTranscript({ ...BASE, step: "summary" }).length, 9);
});

test("calls send JSON without the project header and surface the server's reason", async (context) => {
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options]);
    if (url === "/api/onboarding/answer") return Response.json({ detail: "Email addresses and phone numbers are not kept in your profile." }, { status: 422 });
    return Response.json({ ...BASE, step: "name" });
  });
  assert.equal((await fetchOnboarding()).step, "name");
  await assert.rejects(answerQuestion("business", "me@example.com"), (error) => error instanceof AssistantError && error.status === 422 && /Email addresses/.test(error.message));
  assert.deepEqual(JSON.parse(calls[1][1].body), { step: "business", answer: "me@example.com" });
  assert.equal(calls[1][1].headers["X-Mula-Project"], undefined);
  await confirmSummary(null);
  assert.deepEqual(JSON.parse(calls[2][1].body), { about: null });
});

const NAMED = {
  ...BASE,
  questions: [{ id: "assistant_name", question: "What would you like to call me?", placeholder: "" }, ...BASE.questions],
  assistant_name: "Operator", assistant_name_given: false,
};

test("the assistant's name is the first question; a skipped name shows as Skipped, a given one as the answer", () => {
  assert.deepEqual(onboardingTranscript({ ...NAMED, step: "name" }).slice(1), [
    { from: "assistant", text: "What would you like to call me?" },
    { from: "user", text: "Skipped", skipped: true },
  ]);
  assert.deepEqual(onboardingTranscript({ ...NAMED, step: "name", assistant_name: "Sari", assistant_name_given: true }).slice(1, 3), [
    { from: "assistant", text: "What would you like to call me?" },
    { from: "user", text: "Sari" },
  ]);
  assert.equal(onboardingTranscript({ ...NAMED, step: "assistant_name" }).length, 1);
});

test("proposals are grouped under the reply that made them; ones without a reply are left out", () => {
  const proposal = (id, message_id) => ({ id, message_id, name: id, description: null, status: "pending", project_id: null });
  const grouped = proposalsByMessage([proposal("a", 4), proposal("b", 7), proposal("c", 4), proposal("d", null)]);
  assert.deepEqual([...grouped.keys()], [4, 7]);
  assert.deepEqual(grouped.get(4).map((each) => each.id), ["a", "c"]);
  assert.equal(grouped.get(7).length, 1);
});

test("confirming a proposal posts to its own path and surfaces a full workspace", async (context) => {
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options]);
    return Response.json({ detail: "You have 20 projects, the most a workspace can hold for now." }, { status: 409 });
  });
  await assert.rejects(confirmProposal("abc123"), (error) => error instanceof AssistantError && error.status === 409 && /20 projects/.test(error.message));
  assert.equal(calls[0][0], "/api/orchestrator/proposals/abc123/confirm");
  assert.equal(calls[0][1].method, "POST");
});
