# Orchestrator (server)

The account's personal assistant above its projects, and the scripted onboarding that introduces it. Everything here belongs to the signed-in **account**, not to a project: no route takes `X-Mula-Project`, and nothing here is readable by another account, teammates included.

## What it does

- **Onboarding (`onboarding.py`)**: a fixed welcome (`WELCOME`, also spoken; see Voice), then fixed questions asked one at a time in the assistant's chat: what to call the assistant, the owner's name, what the business does, what they want help with, how they like answers. Then a summary the owner can accept or edit, an optional personality, and done. Each answer is written to `USER.md` as soon as it is given. Any step can be skipped, and **Skip for now** (`skip-all`) ends it wherever it is; the workspace works the same either way. It runs once per account (a row in `onboarding`, made on the first visit) and Settings can restart it. Every change names the step it answers, so a double submit or a second tab gets a 409 rather than skipping a question.
- **The assistant's name**: optional, up to 40 characters of letters, numbers, spaces and `.'-`; skipping or clearing it keeps "Operator" (`DEFAULT_ASSISTANT_NAME`). Stored in `onboarding.assistant_name`, not in `USER.md`; `SOUL.md` gets a "Your name" section from it. Settings changes it (`/api/orchestrator/assistant`).
- **Spoken welcome**: `welcome_pending` is true for an account that hasn't heard it. The client marks it heard (`POST /api/onboarding/welcome`) as it starts, so it plays once per account; a restart doesn't replay it. Accounts that existed before migration 0004 count as having heard it.
- **`USER.md` (`user_file.py`)**: `<data dir>/users/<account id>/USER.md`, owner-only (`0700` folder, `0600` file), outside every project folder. Four fixed sections, one line each (up to 300 characters), so it is read back without guessing; it is the only copy of the answers. Refused, with the reason shown: credentials (including in prose, "my password is …"), card and national ID numbers (the memory filter's rules), and any email address or phone number.
- **Personality (`personality.py`)**: tone, formality, language (English or Bahasa Indonesia) and emoji, from fixed options. Stored in `onboarding.personality`; the orchestrator's `SOUL.md` is rendered from it on every turn (shared identity + its role + a Personality section). `provision_profiles.py` rewrites profiles with the shared identity, so the database, not the file, is the source.
- **Chat (`assistant.py`)**: runs in a runtime profile of its own, `mula-<scope id>`, where the scope id is a uuid5 of the account, so it never equals a project id (uuid4) and never shares a project's runtime state. One ongoing session per account. Each turn's system prompt carries `USER.md` and, for every project the account can open (`workspaces.service.projects_for`, the same membership rule as project routes), that project's memory summary: its business facts, and its owner facts only when the account owns the project. Its one tool is `create_project` (below); it changes nothing inside a project. The visible chat is in `orchestrator_messages`. It uses the default brain (local Qwen).
- **Proposing projects (`proposals.py`)**: each turn issues an assistant ticket (15 minutes) that names only the account, stored hashed in `assistant_tickets`; the prompt tells the model to pass it to Mula tools. `create_project(ticket, name, description?)` on `/mcp` checks the ticket, that the assistant's `project_create` tool is on (`team.require_tool`, refused otherwise), the name and description, the workspace's room and at most 5 pending proposals, then records a **proposal** in `project_proposals`. It creates nothing. The reply carries the proposal; the owner's **Create project** (`POST /api/orchestrator/proposals/{id}/confirm`) creates the project in the same transaction as marking it, with the account from the session; another account's proposal is a 404, an answered one a 409. If the turn fails, its proposals are declined so they don't count as pending. Project-agent tickets are refused by `create_project`, and assistant tickets by every project tool. Settings can switch proposals off (`assistant_tools`).
- **Sign-up** provisions the orchestrator's profile, best effort, so the first message doesn't wait for the gateway's rescan.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/onboarding` | The state: `status` (`active`/`done`), `finished` (`completed`/`skipped`), `step`, `greeting`, `welcome_pending`, `assistant_name`, `assistant_name_given`, `questions`, `about`, `personality`, `personality_options` |
| POST | `/api/onboarding/welcome` | Marks the spoken welcome heard |
| POST | `/api/onboarding/answer` | `{ step, answer }`; empty answers are refused (skip instead) |
| POST | `/api/onboarding/skip` | `{ step }` |
| POST | `/api/onboarding/skip-all` | Ends onboarding; answers so far stay |
| POST | `/api/onboarding/summary` | `{ about: null }` accepts; `{ about: {name, business, help, style} }` replaces first |
| POST | `/api/onboarding/personality` | `{ tone, formality, language, emoji }`; finishes |
| POST | `/api/onboarding/restart` | Back to the first question; `USER.md` keeps its answers until replaced |
| GET/PUT | `/api/orchestrator/profile` | `USER.md` as `{ about }` (Settings) |
| PUT | `/api/orchestrator/personality` | Settings; used from the next message |
| GET/PUT | `/api/orchestrator/assistant` | `{ name, name_given, default_name, tools }`; PUT takes `{ name, propose_projects }` |
| GET | `/api/orchestrator/conversation` | The latest 200 messages and their `proposals` |
| POST | `/api/orchestrator/chat` | `{ message }` (up to 8,000 characters) → `{ reply, truncated, message_id, proposals }` |
| POST | `/api/orchestrator/proposals/{id}/confirm` | Creates the project → `{ proposal, project }`; 409 when the workspace is full |
| POST | `/api/orchestrator/proposals/{id}/decline` | `{ proposal }` |

## Files

| File | Purpose |
|---|---|
| `onboarding.py` | The scripted steps and their state |
| `user_file.py` | `USER.md`: path, checks, render and parse |
| `personality.py` | Options and the rendered `SOUL.md` |
| `assistant.py` | Scope id, prompt, history and one turn |
| `proposals.py` | Assistant tickets, proposals, confirm and decline |
| `routes.py` | The endpoints above |
| `tests/test_orchestrator.py` | Onboarding order, file permissions, 409 on a repeated step, refused answers, skip and skip-all, restart, Settings, account isolation, project summaries by membership (owner facts only for owners), the turn's profile and identity, runtime errors |
| `tests/test_entry.py` | The assistant's name (rules, SOUL.md, Settings), the welcome once per account, proposals (confirm, cross-account 404, tickets that don't cross, switched off, the project limit on both paths, pending cap, failed turn) |

Tables: migration `0003_orchestrator` (`onboarding`, `orchestrator_messages`); `0004_entry_experience` (the name, welcome and tools columns on `onboarding`, `projects.description`, `assistant_tickets`, `project_proposals`).

## Limits

- The reply is not streamed; the chat shows "Thinking…" until it arrives.
- Project summaries are read on every turn, capped at 12,000 characters in total; search across projects is left for later.
- An account that existed before onboarding sees it once on its next visit to `/workspace`, like a new one.
