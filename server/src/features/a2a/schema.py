"""The A2A shapes Mula's agents exchange, pinned to one protocol version.

These follow the Agent2Agent protocol's data model (https://a2a-protocol.org, version
PROTOCOL_VERSION): an agent describes itself with an AgentCard, a request is a Message made of
Parts, and the work it starts is a Task with a status and artifacts. Field names are camelCase on
the wire, as in the specification, and snake_case in Python.

Mula uses them between its own agents only: there is no network listener, so these are the
contract, not a transport. Only the parts Mula needs are modelled (text and data parts; no files,
no streaming or push notifications), and every model refuses unknown fields.
"""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

PROTOCOL_VERSION = "0.3.0"
# Mula keeps a delegated question and its answer to these sizes (ask_agent and the answer turn).
MAX_TEXT = 20_000
MAX_PARTS = 8


class A2AModel(BaseModel):
    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True)

    def wire(self) -> dict:
        """The JSON-ready form, with the specification's camelCase names."""
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)


class TextPart(A2AModel):
    kind: Literal["text"] = "text"
    text: str = Field(max_length=MAX_TEXT)


class DataPart(A2AModel):
    kind: Literal["data"] = "data"
    data: dict[str, Any]


Part = Annotated[TextPart | DataPart, Field(discriminator="kind")]


class Message(A2AModel):
    kind: Literal["message"] = "message"
    # `user` is the side that asks (here, the calling agent); `agent` is the side that answers.
    role: Literal["user", "agent"]
    parts: list[Part] = Field(min_length=1, max_length=MAX_PARTS)
    message_id: str = Field(max_length=100)
    context_id: str | None = Field(default=None, max_length=100)
    task_id: str | None = Field(default=None, max_length=100)
    # Mula's own routing details: which agent is asking which.
    metadata: dict[str, Any] | None = None


# The specification's task states that Mula uses. `auth-required` is a request waiting for the
# owner's OK; `rejected` one the owner declined; `canceled` one that expired before an answer.
TaskState = Literal["submitted", "auth-required", "working", "completed", "rejected", "failed", "canceled"]


class TaskStatus(A2AModel):
    state: TaskState
    # ISO 8601, UTC.
    timestamp: str


class Artifact(A2AModel):
    artifact_id: str = Field(max_length=100)
    name: str = Field(max_length=200)
    parts: list[Part] = Field(min_length=1, max_length=MAX_PARTS)


class Task(A2AModel):
    kind: Literal["task"] = "task"
    id: str
    context_id: str
    status: TaskStatus
    artifacts: list[Artifact] = Field(default_factory=list)
    history: list[Message] = Field(default_factory=list)
    metadata: dict[str, Any] | None = None


class AgentSkill(A2AModel):
    id: str
    name: str
    description: str
    tags: list[str] = Field(default_factory=list)


class AgentCapabilities(A2AModel):
    streaming: bool = False
    push_notifications: bool = False


class AgentCard(A2AModel):
    protocol_version: str = PROTOCOL_VERSION
    name: str
    description: str
    # Mula's agents are reached inside the backend, never over the network, so this is a name
    # (mula://agents/<id>) rather than an address anyone could call.
    url: str
    version: str
    capabilities: AgentCapabilities = Field(default_factory=AgentCapabilities)
    default_input_modes: list[str]
    default_output_modes: list[str]
    skills: list[AgentSkill]
