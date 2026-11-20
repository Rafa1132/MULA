"use client";

import { useEffect, useRef, useState } from "react";
import { AccountForm } from "@/features/auth";
import { addApp, useAddedApps } from "../../services/addedApps.ts";
import { addTask, completeTask, deleteTask, restoreTask, TODO_APP_ID, updateTask, useTasks } from "../store.ts";
import type { Task } from "../store.ts";
import { countTasks, filterTasks, FILTERS, localDay, sortTasks, summaryLabel } from "../tasks.ts";
import type { TaskFilter } from "../tasks.ts";
import TaskForm from "./TaskForm";
import type { TaskFields } from "./TaskForm";
import TaskItem from "./TaskItem";
import "../../apps.css";
import "../todo.css";
import { useProjectId } from "@/common/hooks/useProjectId";
import { projectPath } from "@/common/services/project";

// How long "Task deleted · Undo" stays on screen.
const UNDO_MS = 6000;

function checkboxOf(taskId: string) {
  return document.getElementById(`task-${taskId}-check`);
}

export default function TodoPage() {
  const projectId = useProjectId();
  const [account, setAccount] = useState<{ username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  // Fixed for the visit, so a task does not jump between filters at midnight while editing.
  const [today] = useState(() => localDay(new Date()));
  // "Monday, 16 November" for the masthead, in the same fixed moment as `today`.
  const [dateline] = useState(() => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }));
  const [deleted, setDeleted] = useState<Task | null>(null);
  // After a delete or undo, the id whose checkbox should get focus once React has rendered.
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const addedApps = useAddedApps();
  const tasks = useTasks();

  // Only the account check reaches the backend, as on every signed-in page.
  async function load() {
    setError("");
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) { setAccount(null); return; }
    if (!response.ok) throw new Error("Could not load your account. Please retry.");
    setAccount(await response.json());
  }

  useEffect(() => {
    load().catch((failure: Error) => setError(failure.message)).finally(() => setLoading(false));
    return () => { if (undoTimer.current) clearTimeout(undoTimer.current); };
  }, []);

  useEffect(() => {
    if (focusTarget === null) return;
    const target = checkboxOf(focusTarget);
    if (target) target.focus();
    else listHeading.current?.focus();
    setFocusTarget(null);
  }, [focusTarget, tasks]);

  const visible = sortTasks(filterTasks(tasks, filter, today));
  const counts = countTasks(tasks, today);

  function add(fields: TaskFields) {
    addTask({ title: fields.title, dueDate: fields.dueDate, note: fields.note, source: "user" });
  }

  function save(task: Task, fields: TaskFields) {
    updateTask(task.id, { title: fields.title, dueDate: fields.dueDate, note: fields.note });
  }

  function toggle(task: Task, done: boolean) {
    completeTask(task.id, done);
  }

  function remove(task: Task) {
    // Focus moves to the next task in the list, or the previous one, or the heading.
    const index = visible.findIndex((candidate) => candidate.id === task.id);
    let next: Task | undefined = visible[index + 1];
    if (next === undefined) next = visible[index - 1];
    deleteTask(task.id);
    setDeleted(task);
    setFocusTarget(next?.id ?? "");
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeleted(null), UNDO_MS);
  }

  function undo() {
    if (deleted === null) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    restoreTask(deleted);
    setFocusTarget(deleted.id);
    setDeleted(null);
  }

  if (loading) return <main className="account-screen"><p role="status"><span className="shimmer">Opening To-do…</span></p></main>;
  if (!account && error) return <main className="account-screen"><div><p role="alert">{error}</p><button onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!account) return <AccountForm onSignedIn={load} />;

  let content;
  if (!addedApps.includes(TODO_APP_ID)) {
    content = (
      <div className="apps-empty todo-gate">
        <h2>To-do isn't added yet</h2>
        <p>Add it to keep a short list of daily shop chores. It is remembered in this browser.</p>
        <button type="button" className="apps-button apps-button-primary" onClick={() => addApp(TODO_APP_ID)}>Add To-do</button>
      </div>
    );
  } else {
    const activeFilter = FILTERS.find((candidate) => candidate.id === filter) ?? FILTERS[0];
    let list;
    if (visible.length === 0) {
      list = <p className="todo-empty">{activeFilter.empty}</p>;
    } else {
      list = (
        <ul className="todo-list" aria-labelledby="todo-list-heading">
          {visible.map((task) => <TaskItem key={task.id} task={task} today={today} onToggle={toggle} onSave={save} onDelete={remove} />)}
        </ul>
      );
    }
    content = (
      <>
        <section className="todo-add" aria-labelledby="todo-add-heading">
          <h2 id="todo-add-heading">Add a task</h2>
          <TaskForm idPrefix="todo-new" submitLabel="Add task" onSubmit={add} resetAfterSubmit />
        </section>
        <section className="todo-tasks" aria-labelledby="todo-list-heading">
          <h2 id="todo-list-heading" ref={listHeading} tabIndex={-1}>{activeFilter.label} tasks</h2>
          <div className="todo-filters" role="group" aria-label="Filter tasks">
            {FILTERS.map((option) => (
              <button key={option.id} type="button" className="todo-filter" aria-pressed={option.id === filter} onClick={() => setFilter(option.id)}>
                {option.label} <span className="todo-count">{counts[option.id]}</span>
              </button>
            ))}
          </div>
          {list}
        </section>
      </>
    );
  }

  // A separate app: its own small header (name, plus a link back to Mula) and no main nav.
  return <div className="todo-shell">
    <header className="todo-appbar">
      <div className="todo-masthead">
        <p className="todo-dateline">{dateline}</p>
        <h1 className="todo-appname">To-do</h1>
      </div>
      <a className="todo-home" href={projectPath(projectId)}>Mula</a>
    </header>
    <main className="todo-main">
      <p className="todo-summary">{summaryLabel(tasks, today)}. Tasks are remembered in this browser.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {/* Always rendered, so screen readers announce "Task deleted" when it fills in. */}
      <div className="todo-undo-region" role="status">
        {deleted && <p className="apps-notice todo-undo">Task deleted: {deleted.title}. <button type="button" className="apps-button" onClick={undo}>Undo</button></p>}
      </div>
      {content}
    </main>
  </div>;
}
