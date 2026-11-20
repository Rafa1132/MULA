import assert from "node:assert/strict";
import test from "node:test";

// The page's project; each project keeps its own list.
const PROJECT = "11111111-2222-4333-8444-555555555555";
const KEY = `mula.prototype.project.${PROJECT}.app.todo.tasks`;
const warnings = [];
console.warn = (...args) => warnings.push(args[0]);

/** A fake browser window whose storage can be made to fail. */
function installWindow({ throwOnAccess = false, throwOnWrite = false, initial } = {}) {
  const values = new Map();
  if (initial !== undefined) values.set(KEY, initial);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (throwOnWrite) throw new Error("quota"); values.set(key, value); },
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    location: { pathname: `/projects/${PROJECT}/apps` },
    get localStorage() { if (throwOnAccess) throw new Error("blocked"); return storage; },
  };
  return values;
}

const store = await import("../store.ts");

function fresh(options) {
  const values = installWindow(options);
  store.reloadTasks();
  return values;
}

test("addTask trims input, fills the full task shape and saves under the app's key", () => {
  const values = fresh();
  const task = store.addTask({ title: "  Buy packing tape ", note: " brown ", dueDate: "2026-11-20" });
  assert.equal(task.title, "Buy packing tape");
  assert.equal(task.note, "brown");
  assert.equal(task.dueDate, "2026-11-20");
  assert.equal(task.done, false);
  assert.equal(task.source, "user");
  assert.equal(task.createdAt, task.updatedAt);
  assert.ok(task.id.length > 0);
  assert.deepEqual(store.listTasks(), [task]);
  assert.deepEqual(JSON.parse(values.get(KEY)), [task]);
  // Optional fields default to empty; an agent can say it created the task.
  const bare = store.addTask({ title: "Count the till", source: "agent" });
  assert.equal(bare.note, "");
  assert.equal(bare.dueDate, null);
  assert.equal(bare.source, "agent");
  assert.equal(store.addTask({ title: "No date", dueDate: "" }).dueDate, null);
});

test("invalid input is refused with a readable TaskError and changes nothing", () => {
  fresh();
  assert.throws(() => store.addTask({ title: "   " }), (error) => error instanceof store.TaskError && /Enter a title/.test(error.message));
  assert.throws(() => store.addTask({ title: "x", dueDate: "2026-02-30" }), /valid due date/);
  assert.throws(() => store.addTask({ title: "x".repeat(201) }), /under 200/);
  assert.deepEqual(store.listTasks(), []);
  const task = store.addTask({ title: "Keep" });
  assert.throws(() => store.updateTask(task.id, { title: "" }), store.TaskError);
  assert.equal(store.listTasks()[0].title, "Keep");
});

test("completeTask, updateTask, deleteTask and restoreTask", () => {
  fresh();
  const task = store.addTask({ title: "Restock rice" });
  assert.equal(store.completeTask(task.id).done, true);
  assert.equal(store.completeTask(task.id, false).done, false);
  assert.equal(store.completeTask("missing"), undefined);
  const edited = store.updateTask(task.id, { title: "Restock rice, 5 kg", dueDate: "2026-12-01", note: "from the wholesaler" });
  assert.equal(edited.title, "Restock rice, 5 kg");
  assert.equal(edited.dueDate, "2026-12-01");
  assert.equal(store.updateTask(task.id, { dueDate: "" }).dueDate, null);
  const removed = store.deleteTask(task.id);
  assert.equal(removed.id, task.id);
  assert.deepEqual(store.listTasks(), []);
  store.restoreTask(removed);
  store.restoreTask(removed);
  assert.equal(store.listTasks().length, 1);
  assert.equal(store.deleteTask("missing"), undefined);
});

test("saved tasks are read back, and malformed ones are skipped with a warning", () => {
  warnings.length = 0;
  const good = { id: "a", title: "Sweep", note: "", dueDate: null, done: true, createdAt: "2026-11-16T08:00:00Z", updatedAt: "2026-11-16T08:00:00Z", source: "user" };
  fresh({ initial: JSON.stringify([good, { id: "b", title: "" }, 42, { ...good, id: "c", dueDate: "tomorrow" }]) });
  assert.deepEqual(store.listTasks(), [good]);
  assert.match(warnings[0], /skipped 3 saved task/);
});

test("corrupt saved data starts empty and says why", () => {
  warnings.length = 0;
  fresh({ initial: "{not json" });
  assert.deepEqual(store.listTasks(), []);
  assert.match(warnings[0], /could not read the saved tasks/);
});

test("blocked storage and failed saves keep working for the visit", () => {
  warnings.length = 0;
  fresh({ throwOnAccess: true });
  store.addTask({ title: "Works anyway" });
  assert.equal(store.listTasks().length, 1);
  assert.ok(warnings.some((warning) => /could not open browser storage/.test(warning)));
  warnings.length = 0;
  fresh({ throwOnWrite: true });
  store.addTask({ title: "Not saved" });
  assert.equal(store.listTasks().length, 1);
  assert.match(warnings[0], /could not save the tasks/);
});
