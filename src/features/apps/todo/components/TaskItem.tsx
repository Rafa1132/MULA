"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/common/components";
import type { Task } from "../store.ts";
import { dueLabel, isOverdue } from "../tasks.ts";
import TaskForm from "./TaskForm";
import type { TaskFields } from "./TaskForm";

type Props = {
  task: Task;
  today: string;
  onToggle: (task: Task, done: boolean) => void;
  /** Throws TaskError for invalid input, which the edit form shows. */
  onSave: (task: Task, fields: TaskFields) => void;
  onDelete: (task: Task) => void;
};

/** One task: a real checkbox labelled by the title, its due date and note, and Edit/Delete. */
export default function TaskItem({ task, today, onToggle, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const checkboxId = `task-${task.id}-check`;
  const detailsId = `task-${task.id}-details`;
  const overdue = isOverdue(task, today);

  useEffect(() => {
    // Closing the edit form (Save, Cancel or Escape) returns focus to Edit.
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (editing) {
    return (
      <li className="todo-item todo-item-editing">
        <TaskForm idPrefix={`task-${task.id}-edit`} submitLabel="Save"
          initial={{ title: task.title, dueDate: task.dueDate ?? "", note: task.note }}
          onSubmit={(fields) => { onSave(task, fields); setEditing(false); }}
          onCancel={() => setEditing(false)} />
      </li>
    );
  }

  let due = null;
  if (task.dueDate !== null) {
    due = <span className="todo-due">Due {dueLabel(task.dueDate, today)}</span>;
  }
  let className = "todo-item";
  if (task.done) className += " todo-item-done";
  if (overdue) className += " todo-item-overdue";

  return (
    <li className={className}>
      <input id={checkboxId} type="checkbox" className="todo-check" checked={task.done} aria-describedby={detailsId}
        onChange={(event) => onToggle(task, event.target.checked)} />
      <div className="todo-item-body">
        <label htmlFor={checkboxId} className="todo-title">{task.title}</label>
        <div id={detailsId} className="todo-meta">
          {/* Overdue is a word and an icon, never colour alone. */}
          {overdue && <span className="todo-overdue"><Icon name="attention" />Overdue</span>}
          {due}
          {task.done && <span className="todo-sr">Done</span>}
        </div>
        {task.note && <p className="todo-note">{task.note}</p>}
      </div>
      <div className="todo-item-actions">
        <button type="button" ref={editButton} className="icon-button todo-icon-button" aria-label={`Edit ${task.title}`} onClick={() => setEditing(true)}><Icon name="edit" /></button>
        <button type="button" className="icon-button todo-icon-button" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)}><Icon name="trash" /></button>
      </div>
    </li>
  );
}
