"""Agent Client Protocol access to Mula agents.

Two kinds of route:

- **For the owner, in My agents** (signed in, project-scoped): list, create and revoke the client
  keys of one agent.
- **For the client bridge** (`server/scripts/mula_acp.py`, which speaks ACP to the editor over
  stdio): `GET /api/acp/agent` says which agent a key opens, and `POST /api/acp/prompt` runs one
  turn and streams it as the web chat does (newline-delimited JSON events). Closing the stream
  stops the turn, which is how the bridge handles ACP's `session/cancel`.

A client turn is a normal turn of that agent (its persona, the owner's settings, memory and Mula
tools) in a runtime session of its own per client session, saved in the agent's history with a
note saying it came from a connected client. It cannot ask other agents (see tool_context).
"""
from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..a2a.cards import card_for
from ..agents import routes as agent_routes
from ..operator.routes import ChatRequest, operator_turn
from ..team import service as team
from ..workspaces.access import current_project
from . import service

router = APIRouter()
CLIENT_NOTE = "Sent from a connected client (ACP)"


class KeyInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    label: str = Field(min_length=1, max_length=200)


class PromptInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    # The ACP session id the bridge made up; each one is its own runtime session.
    session_id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.:-]+$")
    message: str = Field(min_length=1, max_length=8000)

    @field_validator("message")
    @classmethod
    def reject_blank_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message must contain non-whitespace text.")
        return value


@router.get("/api/team/{agent_id}/client-keys")
def list_keys(agent_id: str, project: dict = Depends(current_project)):
    team.definition(agent_id)
    return {"keys": service.keys(project["id"], agent_id)}


@router.post("/api/team/{agent_id}/client-keys", status_code=201)
def create_key(agent_id: str, value: KeyInput, project: dict = Depends(current_project)):
    team.definition(agent_id)
    saved, key = service.create_key(project["account_id"], project["id"], agent_id, value.label)
    # The only response that ever carries the key; the page shows it once.
    return {"key": saved, "secret": key}


@router.delete("/api/team/{agent_id}/client-keys/{key_id}")
def revoke_key(agent_id: str, key_id: str, project: dict = Depends(current_project)):
    team.definition(agent_id)
    return {"key": service.revoke_key(project["id"], agent_id, key_id)}


def client(authorization: str | None = Header(default=None)):
    opened = service.resolve_key(authorization)
    # An agent whose file was removed can no longer be reached, even with a valid key.
    team.definition(opened["agent_id"])
    return opened


def client_session(project, agent_id, session_id):
    return uuid5(UUID(project["conversation_id"]), f"acp:{agent_id}:{session_id}")


@router.get("/api/acp/agent")
def client_agent(opened: dict = Depends(client)):
    agent_id = opened["agent_id"]
    return {"agent_id": agent_id, "project": opened["project"]["display_name"], "card": card_for(agent_id).wire()}


@router.post("/api/acp/prompt")
async def client_prompt(value: PromptInput, opened: dict = Depends(client)):
    project = opened["project"]
    agent_id = opened["agent_id"]
    session_id = client_session(project, agent_id, value.session_id)
    if agent_id == "operator":
        return await operator_turn(project, ChatRequest(message=value.message, stream=True), session_id, CLIENT_NOTE)
    return agent_routes.agent_turn(project, agent_id, agent_routes.AgentChatRequest(message=value.message), session_id, CLIENT_NOTE)
