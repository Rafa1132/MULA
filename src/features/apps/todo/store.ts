// PROTOTYPE STORE for the To-do app's tasks.
//
// This module is the only place that knows where tasks live: today this browser's
// localStorage, under a key named after the app id. Moving to the backend (per
// account) means changing this file and nothing else.
//
// addTask, listTasks and completeTask are plain functions with no React in them, so
// an agent tool (for example the Operator's) can call them later. Nothing calls
// them from an agent yet.
import { useSyncExternalStore } from "react";

export const TODO_APP_ID = "todo";
const STORAGE_KEY = `mula.prototype.app.${TODO_APP_ID}.tasks`;
const NO_TASKS: readonly Task[] = [];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_LIMIT = 200;
const NOTE_LIMIT = 1000;

/** Who created a task. Only "user" is used today; "agent" is reserved for agent tools. */
export type TaskSource = "user" | "agent";

export type Task = {
  id: string;
  title: string;
  note: string;
  /** A calendar day, "YYYY-MM-DD", or null for no due date. */
  dueDate: string | null;
  done: boolean;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  source: TaskSource;
};

export type NewTask = { title: string; note?: string; dueDate?: string | null; source?: TaskSource };
export type TaskChanges = { title?: string; note?: string; dueDate?: string | null };

/** Thrown for input a task cannot hold, such as an empty title. The message is shown to people. */
export class TaskError extends Error {}

let current: readonly Task[] | null = null;
const listeners = new Set<() => void>();

/** Whether `value` is a real calendar day written as YYYY-MM-DD. */
export function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function cleanTitle(title: string) {
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new TaskError("Enter a title for the task.");
  if (trimmed.length > TITLE_LIMIT) throw new TaskError(`Keep the title under ${TITLE_LIMIT} characters.`);
  return trimmed;
}

function cleanNote(note: string) {
  const trimmed = note.trim();
  if (trimmed.length > NOTE_LIMIT) throw new TaskError(`Keep the note under ${NOTE_LIMIT} characters.`);
  return trimmed;
}

/** An empty string means "no due date"; anything else must be a real day. */
function cleanDueDate(dueDate: string | null) {
  if (dueDate === null || dueDate.trim() === "") return null;
  if (!isValidDate(dueDate.trim())) throw new TaskError("Choose a valid due date.");
  return dueDate.trim();
}

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A stored value is used only if it has the full task shape; anything else is dropped. */
function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return typeof task.id === "string" && typeof task.title === "string" && task.title.trim() !== ""
    && typeof task.note === "string" && (task.dueDate === null || (typeof task.dueDate === "string" && isValidDate(task.dueDate)))
    && typeof task.done === "boolean" && typeof task.createdAt === "string" && typeof task.updatedAt === "string"
    && (task.source === "user" || task.source === "agent");
}

function browserStorage(): Storage | null {
  // Accessing localStorage throws in some private modes and when site data is blocked.
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch (error) {
    console.warn("Mula could not open browser storage; tasks last only for this visit.", error);
    return null;
  }
}

function readStored(): readonly Task[] {
  const storage = browserStorage();
  if (storage === null) return NO_TASKS;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return NO_TASKS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NO_TASKS;
    const tasks = parsed.filter(isTask);
    if (tasks.length < parsed.length) console.warn(`Mula skipped ${parsed.length - tasks.length} saved task(s) it could not read.`);
    return tasks;
  } catch (error) {
    console.warn("Mula could not read the saved tasks; starting with none.", error);
    return NO_TASKS;
  }
}

function writeStored(tasks: readonly Task[]) {
  const storage = browserStorage();
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn("Mula could not save the tasks; the change lasts only for this visit.", error);
  }
}

function update(tasks: readonly Task[]) {
  current = tasks;
  writeStored(tasks);
  for (const listener of listeners) listener();
}

/** Every task, in the order they were added. Sorting and filtering live in tasks.ts. */
export function listTasks(): readonly Task[] {
  if (current === null) current = readStored();
  return current;
}

/** Add a task. Throws TaskError for an empty or too-long title, a too-long note or an invalid date. */
export function addTask(input: NewTask): Task {
  const now = new Date().toISOString();
  let source: TaskSource = "user";
  if (input.source !== undefined) source = input.source;
  const task: Task = {
    id: newId(),
    title: cleanTitle(input.title),
    note: cleanNote(input.note ?? ""),
    dueDate: cleanDueDate(input.dueDate ?? null),
    done: false,
    createdAt: now,
    updatedAt: now,
    source,
  };
  update([...listTasks(), task]);
  return task;
}

function replaceTask(id: string, change: (task: Task) => Task) {
  const tasks = listTasks();
  const existing = tasks.find((task) => task.id === id);
  if (existing === undefined) return undefined;
  const changed = { ...change(existing), updatedAt: new Date().toISOString() };
  update(tasks.map((task) => {
    if (task.id === id) return changed;
    return task;
  }));
  return changed;
}

/** Mark a task done (or, with `done` false, not done). Returns undefined for an unknown id. */
export function completeTask(id: string, done = true): Task | undefined {
  return replaceTask(id, (task) => ({ ...task, done }));
}

/** Change a task's title, note or due date. Throws TaskError like addTask; undefined for an unknown id. */
export function updateTask(id: string, changes: TaskChanges): Task | undefined {
  // Validate before touching the list, so a bad edit changes nothing.
  const cleaned: TaskChanges = {};
  if (changes.title !== undefined) cleaned.title = cleanTitle(changes.title);
  if (changes.note !== undefined) cleaned.note = cleanNote(changes.note);
  if (changes.dueDate !== undefined) cleaned.dueDate = cleanDueDate(changes.dueDate);
  return replaceTask(id, (task) => ({ ...task, ...cleaned }));
}

/** Remove a task and return it, so the page can offer Undo. */
export function deleteTask(id: string): Task | undefined {
  const tasks = listTasks();
  const removed = tasks.find((task) => task.id === id);
  if (removed === undefined) return undefined;
  update(tasks.filter((task) => task.id !== id));
  return removed;
}

/** Put a deleted task back (Undo). A task that is already present is left alone. */
export function restoreTask(task: Task) {
  const tasks = listTasks();
  if (tasks.some((candidate) => candidate.id === task.id)) return;
  update([...tasks, task]);
}

/** Re-read storage, for a change made in another tab (and for tests). */
export function reloadTasks() {
  current = readStored();
  for (const listener of listeners) listener();
}

function onStorageEvent(event: StorageEvent) {
  if (event.key === STORAGE_KEY || event.key === null) reloadTasks();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorageEvent);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorageEvent);
  };
}

function serverSnapshot() {
  // The server cannot see this browser's storage, so it renders with no tasks.
  return NO_TASKS;
}

/** The tasks, re-rendering when they change here or in another tab. */
export function useTasks() {
  return useSyncExternalStore(subscribe, listTasks, serverSnapshot);
}
