import assert from "node:assert/strict";
import test from "node:test";
import { actionsFor, COLUMN_ORDER, formatTime, groupByColumn, isStarting, needsPolling, statusLine } from "../services/columns.ts";

function card(overrides = {}) {
  return { id: "t_a0000001", title: "Restock rice", notes: "", column: "todo", status: "blocked", agent: "operator", agent_name: "Operator",
    created_by: "owner", created_at: 1_800_000_000, started_at: null, completed_at: null, result: "", last_error: "", ...overrides };
}

test("every column is shown in board order, even when empty, keeping the server's card order", () => {
  const cards = [card({ id: "t_a0000003", column: "done", status: "done" }), card({ id: "t_a0000002" }), card({ id: "t_a0000001" })];
  const groups = groupByColumn(cards);
  assert.deepEqual(groups.map((group) => group.column), COLUMN_ORDER);
  assert.deepEqual(groups.map((group) => group.label), ["To do", "Working", "Needs you", "Done"]);
  assert.deepEqual(groups[0].cards.map((item) => item.id), ["t_a0000002", "t_a0000001"]);
  assert.equal(groups[1].cards.length, 0);
});

test("a started card that no agent has picked up yet shows as Starting and can be sent back", () => {
  const starting = card({ column: "working", status: "ready" });
  assert.ok(isStarting(starting));
  assert.equal(statusLine(starting), "Starting · Operator");
  assert.equal(actionsFor(starting).sendBack, true);
  const running = card({ column: "working", status: "running" });
  assert.equal(isStarting(running), false);
  assert.equal(statusLine(running), "Operator is working");
});

test("Start appears only on waiting cards with an agent; Continue on cards that need the owner", () => {
  assert.deepEqual(actionsFor(card()), { start: true, startLabel: "Start", sendBack: false, done: true, archive: true, edit: true });
  assert.equal(actionsFor(card({ agent: null, agent_name: null })).start, false);
  assert.equal(statusLine(card({ agent: null, agent_name: null })), "No agent yet");
  const question = card({ column: "needs_you", status: "blocked", started_at: 5 });
  assert.equal(actionsFor(question).startLabel, "Continue");
  assert.equal(statusLine(question), "The agent has a question");
  assert.equal(statusLine(card({ column: "needs_you", status: "review" })), "Ready for your review");
});

test("a working card can't be started, finished, edited or archived", () => {
  const actions = actionsFor(card({ column: "working", status: "running" }));
  assert.deepEqual([actions.start, actions.done, actions.edit, actions.archive], [false, false, false, false]);
  const done = actionsFor(card({ column: "done", status: "done" }));
  assert.deepEqual([done.start, done.done, done.archive], [false, false, true]);
});

test("the page polls only while a card is in Working", () => {
  assert.equal(needsPolling([card(), card({ column: "done" })]), false);
  assert.equal(needsPolling([card(), card({ column: "working", status: "ready" })]), true);
  assert.equal(needsPolling([]), false);
});

test("missing times format as nothing", () => {
  assert.equal(formatTime(null), "");
  assert.notEqual(formatTime(1_800_000_000), "");
});
