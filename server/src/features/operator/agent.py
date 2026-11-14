from pathlib import Path
from uuid import UUID

from ...common.config import HERMES_MODEL
from .runtime import chat, stream_chat


OPERATOR_PROMPT = (Path(__file__).parent / "prompts" / "operator.md").read_text(encoding="utf-8")


async def operator_reply(account_id: str, message: str, session_id: UUID, memory_context: str = "", model: str = HERMES_MODEL) -> tuple[str, bool]:
    return await chat(OPERATOR_PROMPT + memory_context, message, session_id, model, account_id=account_id)


def operator_stream(account_id: str, message: str, session_id: UUID, memory_context: str = "", model: str = HERMES_MODEL):
    # Return the iterator directly so disconnects close the Hermes connection.
    return stream_chat(OPERATOR_PROMPT + memory_context, message, session_id, model, account_id=account_id)
