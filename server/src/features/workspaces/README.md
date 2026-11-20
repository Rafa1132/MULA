# Workspaces and projects (server)

A **workspace** is what an account signs into; it holds **projects**. Each project is one business with its own Operator conversation, agents and their settings, map layout, forecasts, agent requests, memory store and vault (`.runtime/workspaces/<project>/memory/`) and runtime profile (`mula-<project>`). The tables are in migration `0002_workspaces_projects`.

## What it does

- **Sign-up** creates the account's workspace in the same transaction (`create_workspace`). It has no project until the owner makes one.
- **Projects** are created by the workspace owner with an optional name (`clean_name`: trimmed, blank means none, up to 80 characters) and an optional description (up to 300 characters), either with **New project** or by confirming a project the assistant proposed (`orchestrator/proposals.py`). A workspace holds up to `MAX_PROJECTS` (20); `insert_project` checks it under a lock on the workspace row, so two requests can't both take the last place (409). A project with no name is shown as "Untitled project" (`public_project` returns both `name` and `display_name`) until the owner renames it. Creating a project provisions its runtime profile; if that fails the request returns 503 and the project still exists, and the next start of `./run.sh` provisions it.
- **Access:** `access.current_project` is the dependency every project feature uses. It reads the `X-Mula-Project` header and returns the project only when the signed-in account has a `project_members` row for it: no header is 400 ("Open a project first."), an unknown project or one the account isn't a member of is 404, so other accounts' project ids are never confirmed. Only owners can rename (403 for members).
- **Existing data:** the migration gives every existing account a workspace and one project whose id is the account id, holding its conversation. The memory folder and runtime profile were already named after that id, so nothing moved on disk.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/workspace` | `{ id, name, projects, max_projects }` for the signed-in account |
| GET | `/api/projects` | The projects the account belongs to, oldest first |
| POST | `/api/projects` | `{ name?, description? }`; 201 with the project; 409 when the workspace is full |
| PATCH | `/api/projects/{id}` | `{ name }`; empty clears it (Untitled). Owner only |
| GET | `/api/project` | The project in `X-Mula-Project`, with the account's `role` |

## Files

| File | Purpose |
|---|---|
| `service.py` | Workspace and project records, names, membership, profile provisioning |
| `access.py` | `current_project`, the project-scoping dependency |
| `routes.py` | The endpoints above |
| `tests/test_workspaces.py` | Naming and Untitled, membership (400/404), per-project memory and conversation, migration backfill |

## Not yet

Inviting teammates (a `member` row exists in the schema; there is no invite flow) and a GitHub connection per project. Both are shown as "Coming soon" on `/workspace`. Archiving a project (`archived_at`) has no endpoint yet.
