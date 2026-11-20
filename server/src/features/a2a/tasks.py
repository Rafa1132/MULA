"""A request between agents as A2A: the question as a Message, the work as a Task.

Requests are stored in `agent_requests` (features/agents/service.py), whose `status` is the one
stored truth. This module only converts: it builds the Message saved with a new request and the
artifacts saved with its answer, and reads a stored row back as a Task. It never touches the
database, so the A2A shapes stay in one place.
"""
from datetime import datetime, timezone
from uuid import UUID, uuid5

from .schema import Artifact, DataPart, Message, Task, TaskStatus, TextPart

# The stored `status` of a request and the A2A task state it means. A pending request is either
# waiting for the owner's OK (auth-required) or approved in advance and about to run (submitted).
STATES = {
    "running": "working",
    "answered": "completed",
    "declined": "rejected",
    "failed": "failed",
    "expired": "canceled",
}


def context_id(project_id: str, from_agent: str, to_agent: str) -> str:
    """One A2A context per pair of agents in a project: their ongoing exchange."""
    return str(uuid5(UUID(project_id), f"a2a:{from_agent}:{to_agent}"))


def state_for(status: str, approved_in_advance: bool) -> str:
    if status == "pending":
        if approved_in_advance:
            return "submitted"
        return "auth-required"
    return STATES[status]


def request_message(request_id: str, context: str, from_agent: str, to_agent: str, question: str, attachment_name: str | None) -> Message:
    """The question as the A2A message the calling agent sends."""
    parts = [TextPart(text=question)]
    if attachment_name is not None:
        # The CSV itself stays in the request row; the message names it rather than copying it.
        parts.append(DataPart(data={"attachment": {"type": "text/csv", "name": attachment_name}}))
    return Message(role="user", parts=parts, message_id=f"{request_id}:question", context_id=context, task_id=request_id,
                   metadata={"from_agent": from_agent, "to_agent": to_agent})


def answer_artifacts(request_id: str, answer: str, forecast: dict | None = None) -> list[Artifact]:
    """The answering agent's reply, plus the forecast it calculated for this request, if any."""
    parts = [TextPart(text=answer)]
    if forecast is not None:
        parts.append(DataPart(data={"forecast": forecast}))
    return [Artifact(artifact_id=f"{request_id}:answer", name="Answer", parts=parts)]


def timestamp(epoch_seconds: int) -> str:
    return datetime.fromtimestamp(epoch_seconds, timezone.utc).isoformat()


def task_from_row(row: dict, status: str) -> Task:
    """A stored request as an A2A task. `status` is the request's current one (expiry included).

    Rows saved before the A2A columns existed have no message or artifacts; they are rebuilt from
    the question and the answer, so every request reads the same way.
    """
    context = row.get("context_id") or context_id(row["project_id"], row["from_agent"], row["to_agent"])
    if row.get("message"):
        message = Message.model_validate(row["message"])
    else:
        message = request_message(row["id"], context, row["from_agent"], row["to_agent"], row["question"], None)
    artifacts = []
    if row.get("artifacts"):
        artifacts = [Artifact.model_validate(item) for item in row["artifacts"]]
    elif row.get("answer"):
        artifacts = answer_artifacts(row["id"], row["answer"])
    return Task(
        id=row["id"],
        context_id=context,
        status=TaskStatus(state=state_for(status, bool(row["approved_in_advance"])), timestamp=timestamp(row["created"])),
        artifacts=artifacts,
        history=[message],
        metadata={"from_agent": row["from_agent"], "to_agent": row["to_agent"]},
    )
