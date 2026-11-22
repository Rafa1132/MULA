"""The project's Board: the Mula runtime's kanban, one board per project.

Rule that everything here keeps: **a card only runs when someone presses Start.** The runtime runs
any `ready` card on its next dispatcher tick and promotes a card without parents to `ready` on its
own, so every card is created `blocked` (the one state the dispatcher never releases) and Start is
the runtime's `unblock`. Agents may add and comment on cards from chat (see agents/tools.py), never
start, finish or archive them.

Columns the page shows, from the runtime's status:
- todo: parked and never started (`blocked` with no `started_at`), or sent back before it began;
- working: `ready` (waiting for the dispatcher, shown as "Starting") or `running`;
- needs_you: `blocked` after a run (the agent asked for help) or `review`;
- done: `done`. Archived cards are hidden.
"""

from fastapi import HTTPException

from ...common import brains, profiles
from ..auth import accounts
from ...common.agent_catalog import CATALOG
from ..operator import runtime as operator_runtime
from ..team import service as team
from . import runtime

COLUMNS = ("todo", "working", "needs_you", "done")
# The runtime writes this author on comments it adds itself, such as a block reason.
RUNTIME_AUTHORS = {"default", "user", "system", ""}


def column_for(task: dict) -> str | None:
    """The page column for a runtime task, or None for one that is hidden (archived)."""
    status = task.get("status")
    if status == "archived":
        return None
    if status == "done":
        return "done"
    if status in ("ready", "running"):
        return "working"
    if status == "review":
        return "needs_you"
    if status == "blocked":
        if task.get("started_at"):
            return "needs_you"
        return "todo"
    # todo, triage and scheduled shouldn't happen on a Mula board; none of them runs on its own.
    return "todo"


def agent_profiles(project_id: str) -> dict[str, str]:
    """Runtime profile name -> agent id, for the project's agents."""
    return {profiles.profile_name(project_id, agent_id): agent_id for agent_id in CATALOG}


def require_agent(agent_id: str | None) -> str | None:
    if agent_id is None:
        return None
    if agent_id not in CATALOG:
        raise HTTPException(422, "Choose one of the project's agents, or none.")
    return agent_id


def author_name(author: str, project_id: str) -> str:
    agent_id = agent_profiles(project_id).get(author)
    if agent_id is not None:
        return CATALOG[agent_id]["name"]
    if author in RUNTIME_AUTHORS:
        return "Board"
    return author


def public_card(task: dict, project_id: str) -> dict:
    agent_id = agent_profiles(project_id).get(task.get("assignee") or "")
    agent_name = None
    if agent_id is not None:
        agent_name = CATALOG[agent_id]["name"]
    return {
        "id": task["id"],
        "title": task.get("title") or "",
        "notes": task.get("body") or "",
        "column": column_for(task),
        "status": task.get("status"),
        "agent": agent_id,
        "agent_name": agent_name,
        "created_by": task.get("created_by") or "",
        "created_at": task.get("created_at"),
        "started_at": task.get("started_at"),
        "completed_at": task.get("completed_at"),
        "result": task.get("result") or "",
        "last_error": task.get("last_failure_error") or "",
    }


def failure(error: runtime.KanbanError) -> HTTPException:
    if error.missing:
        return HTTPException(404, "That card isn't on this board.")
    return HTTPException(409, "The Board couldn't make that change. Refresh and try again.")


async def call(project: dict, args: list[str], stdin: str | None = None, as_json: bool = False):
    await runtime.ensure_board(project["id"], project.get("display_name") or project.get("name") or "")
    try:
        return await runtime.on_board(project["id"], args, stdin, as_json)
    except runtime.KanbanError as error:
        raise failure(error) from error


def project_for_tools(project_id: str) -> dict:
    """The project a tool ticket names, in the shape the routes' current_project gives."""
    with accounts.database() as db:
        row = db.execute("SELECT id, name FROM projects WHERE id = %s AND archived_at IS NULL", (project_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "This project was not found.")
    return {"id": str(row["id"]), "name": row["name"] or "", "display_name": row["name"] or ""}


def agents_for_picker() -> list[dict]:
    return [{"id": agent_id, "name": agent["name"]} for agent_id, agent in sorted(CATALOG.items(), key=lambda item: item[1]["order"])]


async def board(project: dict) -> dict:
    tasks = await call(project, ["list", "--json"], as_json=True)
    if not isinstance(tasks, list):
        raise HTTPException(502, "The Board's runtime gave an unreadable answer.")
    cards = []
    for task in tasks:
        if isinstance(task, dict) and column_for(task) is not None:
            cards.append(public_card(task, project["id"]))
    # Newest first within a column; the page groups them.
    cards.sort(key=lambda card: card["created_at"] or 0, reverse=True)
    return {"columns": list(COLUMNS), "cards": cards, "agents": agents_for_picker()}


async def details(project: dict, card_id: str) -> dict:
    """One card with its comments and runs."""
    runtime.require_card_id(card_id)
    shown = await call(project, ["show", card_id, "--json"], as_json=True)
    if not isinstance(shown, dict) or not isinstance(shown.get("task"), dict):
        raise HTTPException(502, "The Board's runtime gave an unreadable answer.")
    card = public_card(shown["task"], project["id"])
    if card["column"] is None:
        raise HTTPException(404, "That card isn't on this board.")
    card["comments"] = [
        {"author": author_name(comment.get("author") or "", project["id"]), "body": comment.get("body") or "", "created_at": comment.get("created_at")}
        for comment in shown.get("comments") or [] if isinstance(comment, dict)
    ]
    card["runs"] = [
        {"status": run.get("status"), "outcome": run.get("outcome"), "summary": run.get("summary") or "", "error": run.get("error") or "",
         "started_at": run.get("started_at"), "ended_at": run.get("ended_at")}
        for run in shown.get("runs") or [] if isinstance(run, dict)
    ]
    card["latest_summary"] = shown.get("latest_summary") or ""
    return card


async def create(project: dict, title: str, notes: str, agent_id: str | None, created_by: str) -> dict:
    """A new card, always parked in To do: created `blocked`, so nothing runs until Start."""
    require_agent(agent_id)
    args = ["create", "--initial-status", "blocked", "--created-by", created_by, "--body-file", "-", "--json"]
    if agent_id is not None:
        args += ["--assignee", profiles.profile_name(project["id"], agent_id)]
    # `--` ends the options, so a title that starts with "-" is still a title.
    args += ["--", title]
    task = await call(project, args, stdin=notes, as_json=True)
    if not isinstance(task, dict) or "id" not in task:
        raise HTTPException(502, "The Board's runtime gave an unreadable answer.")
    return public_card(task, project["id"])


async def update(project: dict, card_id: str, title: str | None, notes: str | None, agent_id: str | None, change_agent: bool) -> dict:
    card = await details(project, card_id)
    if card["status"] == "running":
        raise HTTPException(409, "The agent is working on this card. Wait until it finishes.")
    edit = ["edit", card_id]
    if title is not None:
        edit.append(f"--title={title}")
    if notes is not None:
        edit.append(f"--body={notes}")
    if len(edit) > 2:
        await call(project, edit)
    if change_agent:
        require_agent(agent_id)
        profile = "none"
        if agent_id is not None:
            profile = profiles.profile_name(project["id"], agent_id)
        await call(project, ["assign", card_id, profile])
    return await details(project, card_id)


async def start(project: dict, card_id: str) -> dict:
    """Start (or continue) a card: the only way a card begins to run.

    The worker runs as the card's agent with that agent's brain: chat sends the brain with every
    turn, but a board worker would otherwise use the profile's default (local Qwen), so the brain
    is copied onto the card first. The same checks as a chat turn apply: the brain must be set up,
    and the agent's profile must exist and be served by the runtime."""
    card = await details(project, card_id)
    if card["column"] not in ("todo", "needs_you"):
        raise HTTPException(409, "Only a card in To do or Needs you can be started.")
    agent_id = card["agent"]
    if agent_id is None:
        raise HTTPException(409, "Choose an agent for this card first.")
    config = team.settings(project["id"], agent_id)
    brain_id = config["brain"]
    try:
        await operator_runtime.require_model(brains.alias_for(brain_id))
        operator_runtime.account_base_url(project["id"], None, agent_id, config["runtime_toolsets"])
    except operator_runtime.HermesError as error:
        raise HTTPException(error.status_code, str(error)) from error
    brain = brains.BRAINS[brain_id or brains.DEFAULT_BRAIN]
    if "runtime_model" in brain:
        await call(project, ["set-model", card_id, brain["runtime_model"], "--provider", brain["provider"]])
    else:
        await call(project, ["set-model", card_id, "none"])
    await call(project, ["unblock", card_id])
    return await details(project, card_id)


async def send_back(project: dict, card_id: str) -> dict:
    """Undo a Start that the dispatcher hasn't picked up yet: back to To do."""
    card = await details(project, card_id)
    if card["status"] != "ready":
        raise HTTPException(409, "Only a card that is still starting can be sent back.")
    await call(project, ["block", card_id])
    return await details(project, card_id)


async def finish(project: dict, card_id: str, finished_by: str) -> dict:
    card = await details(project, card_id)
    if card["column"] not in ("todo", "needs_you"):
        raise HTTPException(409, "A card can be marked done from To do or Needs you.")
    await call(project, ["complete", card_id, "--summary", f"Marked done by {finished_by}."])
    return await details(project, card_id)


async def comment(project: dict, card_id: str, author: str, text: str) -> dict:
    runtime.require_card_id(card_id)
    await call(project, ["comment", card_id, "--author", author, "--", text])
    return await details(project, card_id)


async def archive(project: dict, card_id: str) -> None:
    card = await details(project, card_id)
    if card["column"] == "working":
        raise HTTPException(409, "A card can't be archived while it is working.")
    await call(project, ["archive", card_id])
