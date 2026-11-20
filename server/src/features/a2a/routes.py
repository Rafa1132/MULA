"""Read-only A2A views for My agents: each agent's card, and the tasks between agents.

Both are project pages' data, behind the same membership check as the rest of the team API.
Nothing here is reachable without signing in, and no agent can be called through these routes.
"""
from fastapi import APIRouter, Depends, Query

from ..agents import service as agents
from ..team import service as team
from ..workspaces.access import current_project
from .cards import card_for

router = APIRouter()


@router.get("/api/team/tasks")
def tasks(agent: str | None = Query(default=None, max_length=40), project: dict = Depends(current_project)):
    if agent is not None:
        team.definition(agent)
    return {"tasks": agents.project_tasks(project["id"], agent)}


@router.get("/api/team/{agent_id}/card")
def card(agent_id: str, project: dict = Depends(current_project)):
    team.definition(agent_id)
    return card_for(agent_id).wire()
