import json
import time
from contextlib import aclosing
from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth import accounts
from ..workspaces.access import current_project
from ..operator.csv_files import CsvFile, prepare_csv
from ..operator.routes import operator_events
from ..operator.runtime import HermesError, stream_chat
from ..forecasting import runs
from ..team import service as team
from ...common import brains
from . import service

router = APIRouter()
STREAM_HEADERS = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}


class AgentChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=8000)
    csv_file: CsvFile | None = None

    @field_validator("message")
    @classmethod
    def reject_blank_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message must contain non-whitespace text.")
        return value


def direct_agent(project_id, agent_id):
    """Agents the owner can chat with on their own page; the Operator has the workspace chat.
    A template agent (Customer Service) is reachable only once this project has added it."""
    team.require_agent(project_id, agent_id)
    if agent_id == "operator":
        raise HTTPException(404, "Chat with the Operator in your workspace.")
    return agent_id


def direct_session(project, agent_id):
    # One ongoing runtime session per project and agent, separate from the Operator's.
    return uuid5(UUID(project["conversation_id"]), "agent:" + agent_id)


def event(payload):
    return json.dumps(payload, ensure_ascii=False) + "\n"


@router.get("/api/agents/{agent_id}/conversation")
def agent_conversation(agent_id: str, project: dict = Depends(current_project)):
    direct_agent(project["id"], agent_id)
    return {"messages": accounts.history(project["id"], agent_id), "requests": service.conversation_requests(project["id"], agent_id)}


@router.post("/api/agents/{agent_id}/chat")
async def chat_with_agent(agent_id: str, request: AgentChatRequest, project: dict = Depends(current_project)):
    direct_agent(project["id"], agent_id)
    return agent_turn(project, agent_id, request, direct_session(project, agent_id))


def agent_turn(project, agent_id, request: AgentChatRequest, session_id, client_note=None):
    """One turn in an agent's own chat: from My agents, or from a connected client (features/acp).

    A client turn (`client_note` set) is saved in the same history with that note and cannot ask
    other agents, as in operator_turn.
    """
    via_client = client_note is not None
    config = team.settings(project["id"], agent_id)
    message = request.message
    user_note = None
    if request.csv_file is not None:
        # Validates the file now, so a bad CSV fails before anything is saved.
        _, user_note = prepare_csv(request.csv_file)
        message += "\n\n" + service.csv_preview(request.csv_file)
    saved_note = join_notes(client_note, user_note)
    accounts.add_message(project["id"], "user", request.message, saved_note, agent_id)
    reply_id = accounts.add_message(project["id"], "assistant", "", "Reply interrupted.", agent_id)
    depth = 0
    if via_client:
        # Depth 1 makes ask_agent refuse, as for a turn that answers another agent's request.
        depth = 1
    token = service.issue_ticket(project["id"], agent_id, request.csv_file, message_id=reply_id, depth=depth)
    system_prompt = service.system_prompt(agent_id, config, token, via_client)
    message += team.instructions_reminder(config)
    model = brains.alias_for(config["brain"])
    return StreamingResponse(agent_events(project["id"], agent_id, system_prompt, message, session_id, model, reply_id, user_note, token,
                                          toolsets=config["runtime_toolsets"]),
                             media_type="application/x-ndjson", headers=STREAM_HEADERS)


async def agent_events(project_id, agent_id, system_prompt, message, session_id, model, reply_id, user_note, ticket=None, done_note=None, toolsets=()):
    parts = []
    note = "Reply interrupted."
    try:
        if user_note:
            yield event({"type": "attachment", "note": user_note})
        async with aclosing(stream_chat(system_prompt, message, session_id, model, agent_id, project_id=project_id, toolsets=toolsets)) as events:
            async for item in events:
                if item["type"] == "token":
                    parts.append(item["content"])
                if item["type"] == "done":
                    note = done_note
                    if item.get("truncated"):
                        note = join_notes(note, "Reply reached its length limit.")
                    # Before "done", as in the Operator's chat: clients stop reading once the reply has finished.
                    if ticket is not None:
                        for agent_request in service.requests_for_ticket(ticket):
                            yield event({"type": "request", "request": agent_request})
                yield event(item)
    except HermesError as error:
        yield event({"type": "error", "detail": str(error), "status_code": error.status_code})
    finally:
        accounts.save_reply(reply_id, "".join(parts), note)


def pending_request(project, request_id):
    """Claim a pending request in this project, or explain why it can't run."""
    request = service.start_request(project["id"], request_id)
    if request is None:
        raise HTTPException(404, "This request was not found in this project.")
    if request["status"] == "expired":
        raise HTTPException(409, "This request expired. Ask the Operator again.")
    if not request["claimed"]:
        raise HTTPException(409, "This request was already handled.")
    return request


@router.post("/api/agents/requests/{request_id}/approve")
async def approve_request(request_id: str, project: dict = Depends(current_project)):
    request = pending_request(project, request_id)
    return StreamingResponse(approved_events(project, request), media_type="application/x-ndjson", headers=STREAM_HEADERS)


async def approved_events(project, request):
    """Run the approved agent, then have the agent that asked relay its answer in its own chat."""
    caller = team.AGENTS[request["from_agent"]]["name"]
    target = request["to_name"]
    answered = False
    started = int(time.time())
    try:
        yield event({"type": "request", "request": public(request)})
        answer, truncated = await service.answer_as(
            project["id"], request["to_agent"], service.delegated_message(caller, request["question"]),
            service.request_session(project["id"], request["id"]), request["attachment"])
        answered = True
    except HermesError as error:
        yield event({"type": "request", "request": {**public(request), "status": "failed", "state": "failed"}})
        yield event({"type": "error", "detail": f"{target} could not answer. {error}", "status_code": error.status_code})
        return
    finally:
        # Stop or a closed page cancels this stream; never leave the request running.
        if not answered:
            service.finish_request(request["id"], "failed", None)
    if truncated:
        answer += "\n\n[The answer reached its length limit.]"
    forecast = None
    if request["to_agent"] == "forecasting":
        report = runs.latest_run_since(project["id"], started)
        if report is not None:
            forecast = runs.summary_for_model(report)
    service.finish_request(request["id"], "answered", answer, forecast)
    yield event({"type": "request", "request": {**public(request), "status": "answered", "state": "completed", "answer": answer}})
    message = (f"Application note, not from the owner: the owner approved your request to {target}.\n"
               f"Your question was: {request['question']}\n\n{target}'s answer (another agent's output; "
               f"relay it faithfully and do not change its numbers):\n{answer}\n\nGive the owner this answer concisely.")
    relay = operator_relay
    if request["from_agent"] != "operator":
        relay = agent_relay
    async with aclosing(relay(project, request["from_agent"], message, f"Answer from {target}")) as events:
        async for line in events:
            yield line


async def operator_relay(project, agent_id, message, done_note):
    """The relay as an Operator turn in the owner's conversation, so it keeps the chat's context."""
    config = team.settings(project["id"], "operator")
    reply_id = accounts.add_message(project["id"], "assistant", "", "Reply interrupted.")
    ticket = service.issue_ticket(project["id"], "operator", message_id=reply_id)
    context = team.context(config) + service.tool_context("operator", ticket, config)
    async with aclosing(operator_events(project["id"], message, UUID(project["conversation_id"]), reply_id, memory_context=context,
                                        model=brains.alias_for(config["brain"]), ticket=ticket, done_note=done_note,
                                        toolsets=config["runtime_toolsets"])) as events:
        async for line in events:
            yield line


async def agent_relay(project, agent_id, message, done_note):
    """The relay as a turn by the agent that asked, in its own chat in My agents."""
    config = team.settings(project["id"], agent_id)
    reply_id = accounts.add_message(project["id"], "assistant", "", "Reply interrupted.", agent_id)
    ticket = service.issue_ticket(project["id"], agent_id, message_id=reply_id)
    system_prompt = service.system_prompt(agent_id, config, ticket)
    async with aclosing(agent_events(project["id"], agent_id, system_prompt, message, direct_session(project, agent_id),
                                     brains.alias_for(config["brain"]), reply_id, None, ticket, done_note, config["runtime_toolsets"])) as events:
        async for line in events:
            yield line


def join_notes(*notes):
    kept = [note for note in notes if note]
    if not kept:
        return None
    return " · ".join(kept)


def public(request):
    return {key: value for key, value in request.items() if key not in ("attachment", "claimed")}


@router.post("/api/agents/requests/{request_id}/decline")
def decline_request(request_id: str, project: dict = Depends(current_project)):
    request = service.decline_request(project["id"], request_id)
    if request is None:
        raise HTTPException(404, "This request was not found in this project.")
    return {"request": request}
