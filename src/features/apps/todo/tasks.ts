// Pure helpers for the To-do page: filters, sorting, counts and date labels.
// Dates are calendar days ("YYYY-MM-DD") compared as strings, in the browser's local time.
import type { Task } from "./store.ts";

export type TaskFilter = "all" | "today" | "upcoming" | "done";

export const FILTERS: { id: TaskFilter; label: string; empty: string }[] = [
  { id: "all", label: "All", empty: "No tasks yet. Add your first one above." },
  { id: "today", label: "Today", empty: "Nothing due today." },
  { id: "upcoming", label: "Upcoming", empty: "Nothing coming up." },
  { id: "done", label: "Done", empty: "No finished tasks yet." },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today's local calendar day as "YYYY-MM-DD". */
export function localDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function nextDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return localDay(new Date(year, month - 1, date + 1));
}

export function isOverdue(task: Task, today: string) {
  return !task.done && task.dueDate !== null && task.dueDate < today;
}

/** Which filters a task belongs to. "Today" includes overdue tasks, so nothing late is hidden. */
export function inFilter(task: Task, filter: TaskFilter, today: string) {
  if (filter === "all") return true;
  if (filter === "done") return task.done;
  if (task.done || task.dueDate === null) return false;
  if (filter === "today") return task.dueDate <= today;
  return task.dueDate > today;
}

export function filterTasks(tasks: readonly Task[], filter: TaskFilter, today: string) {
  return tasks.filter((task) => inFilter(task, filter, today));
}

export function countTasks(tasks: readonly Task[], today: string): Record<TaskFilter, number> {
  return {
    all: tasks.length,
    today: filterTasks(tasks, "today", today).length,
    upcoming: filterTasks(tasks, "upcoming", today).length,
    done: filterTasks(tasks, "done", today).length,
  };
}

/** Open tasks first, then by due date (undated last), then oldest first. */
export function sortTasks(tasks: readonly Task[]) {
  return [...tasks].sort((first, second) => {
    if (first.done !== second.done) {
      if (first.done) return 1;
      return -1;
    }
    if (first.dueDate !== second.dueDate) {
      if (first.dueDate === null) return 1;
      if (second.dueDate === null) return -1;
      return first.dueDate.localeCompare(second.dueDate);
    }
    return first.createdAt.localeCompare(second.createdAt);
  });
}

/** "Today", "Tomorrow", "20 Nov", or "20 Nov 2027" outside this year. */
export function dueLabel(dueDate: string, today: string) {
  if (dueDate === today) return "Today";
  if (dueDate === nextDay(today)) return "Tomorrow";
  const [year, month, day] = dueDate.split("-").map(Number);
  const label = `${day} ${MONTHS[month - 1]}`;
  if (dueDate.slice(0, 4) === today.slice(0, 4)) return label;
  return `${label} ${year}`;
}

/** "3 open · 1 overdue", "Nothing open". */
export function summaryLabel(tasks: readonly Task[], today: string) {
  const open = tasks.filter((task) => !task.done).length;
  const overdue = tasks.filter((task) => isOverdue(task, today)).length;
  if (open === 0) return "Nothing open";
  let label = `${open} open`;
  if (overdue > 0) label += ` · ${overdue} overdue`;
  return label;
}
