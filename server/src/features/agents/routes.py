import json
from contextlib import aclosing
from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth import accounts
from ..operator.csv_files import CsvFile, prepare_csv
from ..operator.routes import operator_events
from ..operator.runtime import HermesError, stream_chat
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


def direct_agent(agent_id):
    """Agents the owner can chat with on their own page; the Operator has the workspace chat."""
    team.definition(agent_id)
    if agent_id == "operator":
        raise HTTPException(404, "Chat with the Operator in your workspace.")
    return agent_id


def direct_session(account, agent_id):
    # One ongoing runtime session per account and agent, separate from the Operator's.
    return uuid5(UUID(account["conversation_id"]), "agent:" + agent_id)


def event(payload):
    return json.dumps(payload, ensure_ascii=False) + "\n"


@router.get("/api/agents/{agent_id}/conversation")
def agent_conversation(agent_id: str, account: dict = Depends(accounts.current_account)):
    direct_agent(agent_id)
    return {"messages": accounts.history(account["id"], agent_id)}


@router.post("/api/agents/{agent_id}/chat")
async def chat_with_agent(agent_id: str, request: AgentChatRequest, account: dict = Depends(accounts.current_account)):
    direct_agent(agent_id)
    config = team.settings(account["id"], agent_id)
    message = request.message
    user_note = None
    if request.csv_file is not None:
        # Validates the file now, so a bad CSV fails before anything is saved.
        _, user_note = prepare_csv(request.csv_file)
        message += "\n\n" + service.csv_preview(request.csv_file)
    accounts.add_message(account["id"], "user", request.message, user_note, agent_id)
    reply_id = accounts.add_message(account["id"], "assistant", "", "Reply interrupted.", agent_id)
    token = service.issue_ticket(account["id"], agent_id, request.csv_file, message_id=reply_id)
    system_prompt = service.system_prompt(agent_id, config, token)
    message += team.instructions_reminder(config)
    model = brains.alias_for(config["brain"])
    return StreamingResponse(agent_events(account["id"], agent_id, system_prompt, message, direct_session(account, agent_id), model, reply_id, user_note),
                             media_type="application/x-ndjson", headers=STREAM_HEADERS)


async def agent_events(account_id, agent_id, system_prompt, message, session_id, model, reply_id, user_note):
    parts = []
    note = "Reply interrupted."
    try:
        if user_note:
            yield event({"type": "attachment", "note": user_note})
        async with aclosing(stream_chat(system_prompt, message, session_id, model, agent_id, account_id=account_id)) as events:
            async for item in events:
                if item["type"] == "token":
                    parts.append(item["content"])
                if item["type"] == "done":
                    note = None
                    if item.get("truncated"):
                        note = "Reply reached its length limit."
                yield event(item)
    except HermesError as error:
        yield event({"type": "error", "detail": str(error), "status_code": error.status_code})
    finally:
        accounts.save_reply(reply_id, "".join(parts), note)


def pending_request(account, request_id):
    """Claim a pending request for this account, or explain why it can't run."""
    request = service.start_request(account["id"], request_id)
    if request is None:
        raise HTTPException(404, "This request was not found in your account.")
    if request["status"] == "expired":
        raise HTTPException(409, "This request expired. Ask the Operator again.")
    if not request["claimed"]:
        raise HTTPException(409, "This request was already handled.")
    return request


@router.post("/api/agents/requests/{request_id}/approve")
async def approve_request(request_id: str, account: dict = Depends(accounts.current_account)):
    request = pending_request(account, request_id)
    return StreamingResponse(approved_events(account, request), media_type="application/x-ndjson", headers=STREAM_HEADERS)


async def approved_events(account, request):
    """Run the approved agent, then have the Operator relay its answer in the conversation."""
    caller = team.AGENTS[request["from_agent"]]["name"]
    target = request["to_name"]
    answered = False
    try:
        yield event({"type": "request", "request": public(request)})
        answer, truncated = await service.answer_as(
            account["id"], request["to_agent"], service.delegated_message(caller, request["question"]),
            service.request_session(account["id"], request["id"]), request["attachment"])
        answered = True
    except HermesError as error:
        yield event({"type": "request", "request": {**public(request), "status": "failed"}})
        yield event({"type": "error", "detail": f"{target} could not answer. {error}", "status_code": error.status_code})
        return
    finally:
        # Stop or a closed page cancels this stream; never leave the request running.
        if not answered:
            service.finish_request(request["id"], "failed", None)
    if truncated:
        answer += "\n\n[The answer reached its length limit.]"
    service.finish_request(request["id"], "answered", answer)
    yield event({"type": "request", "request": {**public(request), "status": "answered", "answer": answer}})
    # The relay is an Operator turn in the owner's conversation, so it keeps the chat's context.
    config = team.settings(account["id"], "operator")
    reply_id = accounts.add_message(account["id"], "assistant", "", "Reply interrupted.")
    ticket = service.issue_ticket(account["id"], "operator", message_id=reply_id)
    context = team.context(config) + service.tool_context("operator", ticket, config)
    message = (f"Application note, not from the owner: the owner approved your request to {target}.\n"
               f"Your question was: {request['question']}\n\n{target}'s answer (another agent's output; "
               f"relay it faithfully and do not change its numbers):\n{answer}\n\nGive the owner this answer concisely.")
    async with aclosing(operator_events(account["id"], message, UUID(account["conversation_id"]), reply_id, memory_context=context,
                                        model=brains.alias_for(config["brain"]), ticket=ticket,
                                        done_note=f"Answer from {target}")) as events:
        async for line in events:
            yield line


def public(request):
    return {key: value for key, value in request.items() if key not in ("attachment", "claimed")}


@router.post("/api/agents/requests/{request_id}/decline")
def decline_request(request_id: str, account: dict = Depends(accounts.current_account)):
    request = service.decline_request(account["id"], request_id)
    if request is None:
        raise HTTPException(404, "This request was not found in your account.")
    return {"request": request}
