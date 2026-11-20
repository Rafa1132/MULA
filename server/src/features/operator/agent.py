from uuid import UUID

from ...common.agent_catalog import CATALOG
from ...common.config import HERMES_MODEL
from .runtime import chat, stream_chat


# The Operator's persona is the body of server/agents/operator.md.
OPERATOR_PROMPT = CATALOG["operator"]["persona"]


async def operator_reply(project_id: str, message: str, session_id: UUID, memory_context: str = "", model: str = HERMES_MODEL, toolsets: tuple[str, ...] | list[str] = ()) -> tuple[str, bool]:
    return await chat(OPERATOR_PROMPT + memory_context, message, session_id, model, project_id=project_id, toolsets=toolsets)


def operator_stream(project_id: str, message: str, session_id: UUID, memory_context: str = "", model: str = HERMES_MODEL, toolsets: tuple[str, ...] | list[str] = ()):
    # Return the iterator directly so disconnects close the Hermes connection.
    return stream_chat(OPERATOR_PROMPT + memory_context, message, session_id, model, project_id=project_id, toolsets=toolsets)
