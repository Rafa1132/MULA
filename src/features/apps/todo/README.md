# To-do (prototype app)

A small task list for daily shop chores, at `/apps/todo`. It is the first Catalogue app with a page of its own. Once it is added, every **Open** for it (Catalogue card, detail page, My apps) is a link built from the entry's `launchUrl` that opens it in a new tab. Front end only; tasks are saved in this browser.

It is laid out as a separate app: its own header with the name "To-do" (the page's h1) and a small **Mula** link back to the dashboard (`/`), and no main left nav.

## Page

- **Not added yet:** a short message and **Add To-do** (through the shared added-apps store) instead of the app.
- **Add a task:** Title (required), Due date and Note (optional), each with a `<label>`. Enter submits from any field; a blank title shows an error tied to the field and keeps focus there.
- **List:** open tasks first, then by due date, undated last. Each task has a real checkbox named by its title, its due date ("Today", "Tomorrow", "20 Nov") and note. Overdue tasks say **Overdue** with a warning icon and get a darker edge, so it never depends on colour alone. Done tasks are struck through.
- **Edit** opens the same three fields inline: Enter saves, Escape or Cancel closes, and focus returns to Edit. **Delete** removes the task at once and shows "Task deleted" with **Undo** for 6 seconds instead of a confirmation dialog; focus moves to the next task.
- **Filters:** All, Today (open tasks due today or overdue), Upcoming (open tasks due later) and Done, each with a count and its own empty state. Tasks without a due date appear only under All.
- Icon buttons are labelled ("Edit Buy packing tape"), and at phone width the form stacks, row actions drop under the text and tap targets are 44 px.

## Look

The app has its own style, a printed notebook, so it feels separate from Mula: warm paper with a dot grid, an italic **Instrument Serif** masthead (loaded by `next/font` in `src/app/apps/todo/page.tsx`, like Geist in the root layout) with a hand-drawn vermilion underline and the date, an index-card form held by a strip of tape, sticker filters (the chosen one highlighted and slightly askew), tasks on a ruled page with a red margin line and serif numbers, hand-drawn checkboxes and a tilted "Overdue" stamp. All colours are `--td-*` tokens in `todo.css`, with a dark set. Measured text contrast, lowest per theme: 5.77:1 light, 7.68:1 dark (vermilion text, quiet text and ink on both paper and card). Motion is limited to small hover lifts and the tick, and only when reduced motion is not requested.

## Data

`store.ts` is the only module that knows where tasks live: localStorage under `mula.prototype.project.<project id>.app.todo.tasks` (keyed by the project and the app id), so each project has its own list. Reads and writes are wrapped in try/catch; blocked storage keeps working for the visit, and malformed saved tasks are skipped with a warning. Moving to the backend per account means changing this one file.

```ts
type Task = { id; title; note; dueDate: "YYYY-MM-DD" | null; done; createdAt; updatedAt; source: "user" | "agent" };
listTasks(): readonly Task[]
addTask({ title, note?, dueDate?, source? }): Task   // throws TaskError for bad input
completeTask(id, done = true): Task | undefined
updateTask(id, { title?, note?, dueDate? }), deleteTask(id), restoreTask(task), useTasks()
```

`tasks.ts` holds the pure helpers: filters, counts, sorting, overdue and date labels.

## Agent hook (not wired)

`addTask`, `listTasks` and `completeTask` are plain functions with typed input and no React, so the Operator agent could call them later as tools, creating tasks with `source: "agent"`. Nothing connects an agent to them yet: today the tasks live only in the browser, so an agent tool would first need the store to move to the backend.

## Files and checks

`components/TodoPage.tsx`, `components/TaskForm.tsx`, `components/TaskItem.tsx`, `store.ts`, `tasks.ts`, `todo.css` (builds on `../apps.css`), the route `src/app/apps/todo/page.tsx`. Unit tests `tests/store.test.mjs` and `tests/tasks.test.mjs` run with `npm test`. The browser check fakes the signed-in account, so it needs only the frontend:

```
MULA_TEST_URL=http://localhost:3000 node src/features/apps/todo/tests/browser.spec.mjs
```
