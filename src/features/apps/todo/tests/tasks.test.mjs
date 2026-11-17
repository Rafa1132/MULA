import assert from "node:assert/strict";
import test from "node:test";
import { countTasks, dueLabel, filterTasks, isOverdue, localDay, sortTasks, summaryLabel } from "../tasks.ts";

const TODAY = "2026-11-16";
let order = 0;
function task(title, { dueDate = null, done = false } = {}) {
  order += 1;
  const stamp = `2026-11-10T08:00:${String(order).padStart(2, "0")}Z`;
  return { id: title, title, note: "", dueDate, done, createdAt: stamp, updatedAt: stamp, source: "user" };
}

const late = task("Late", { dueDate: "2026-11-14" });
const due = task("Due today", { dueDate: TODAY });
const soon = task("Tomorrow", { dueDate: "2026-11-17" });
const undated = task("Someday");
const finished = task("Finished", { dueDate: "2026-11-01", done: true });
const all = [undated, finished, soon, due, late];

test("Today holds open tasks due today or earlier; Upcoming holds later ones; Done holds finished ones", () => {
  assert.deepEqual(filterTasks(all, "today", TODAY).map((item) => item.title), ["Due today", "Late"]);
  assert.deepEqual(filterTasks(all, "upcoming", TODAY).map((item) => item.title), ["Tomorrow"]);
  assert.deepEqual(filterTasks(all, "done", TODAY).map((item) => item.title), ["Finished"]);
  assert.equal(filterTasks(all, "all", TODAY).length, 5);
  assert.deepEqual(countTasks(all, TODAY), { all: 5, today: 2, upcoming: 1, done: 1 });
});

test("open tasks come first, then by due date with undated last", () => {
  assert.deepEqual(sortTasks(all).map((item) => item.title), ["Late", "Due today", "Tomorrow", "Someday", "Finished"]);
});

test("only open tasks past their due date are overdue", () => {
  assert.equal(isOverdue(late, TODAY), true);
  assert.equal(isOverdue(due, TODAY), false);
  assert.equal(isOverdue(finished, TODAY), false);
  assert.equal(isOverdue(undated, TODAY), false);
});

test("labels read naturally", () => {
  assert.equal(dueLabel(TODAY, TODAY), "Today");
  assert.equal(dueLabel("2026-11-17", TODAY), "Tomorrow");
  assert.equal(dueLabel("2026-12-31", "2026-12-30"), "Tomorrow");
  assert.equal(dueLabel("2027-01-01", "2026-12-31"), "Tomorrow");
  assert.equal(dueLabel("2026-11-20", TODAY), "20 Nov");
  assert.equal(dueLabel("2027-03-05", TODAY), "5 Mar 2027");
  assert.equal(summaryLabel(all, TODAY), "4 open · 1 overdue");
  assert.equal(summaryLabel([finished], TODAY), "Nothing open");
  assert.equal(localDay(new Date(2026, 0, 5)), "2026-01-05");
});
