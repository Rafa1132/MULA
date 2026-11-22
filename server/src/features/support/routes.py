from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..workspaces.access import current_project
from . import service

router = APIRouter(prefix="/api/support")


class Reply(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=service.REPLY_MAX)

    @field_validator("text")
    @classmethod
    def readable(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Write a reply.")
        return value


@router.get("/tickets")
def tickets(status: str = "open", project: dict = Depends(current_project)):
    return {"tickets": service.tickets(project["id"], status)}


@router.post("/tickets/{ticket_id}/resolve")
def resolve(ticket_id: str, project: dict = Depends(current_project)):
    return service.resolve(project["id"], ticket_id)


@router.get("/conversations/{conversation_id}")
def conversation(conversation_id: str, project: dict = Depends(current_project)):
    return service.conversation(project["id"], conversation_id)


@router.post("/conversations/{conversation_id}/reply")
async def reply(conversation_id: str, value: Reply, project: dict = Depends(current_project)):
    return await service.owner_reply(project["id"], conversation_id, value.text)


@router.post("/conversations/{conversation_id}/template")
async def template(conversation_id: str, project: dict = Depends(current_project)):
    return await service.owner_template(project["id"], conversation_id)
