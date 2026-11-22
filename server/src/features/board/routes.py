from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..workspaces.access import current_project
from . import service

router = APIRouter(prefix="/api/board")


def readable(value: str, label: str) -> str:
    value = value.strip()
    if not value or "\x00" in value:
        raise ValueError(f"{label} needs readable text.")
    return value


class NewCard(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=4000)
    agent: str | None = Field(default=None, max_length=40)

    @field_validator("title")
    @classmethod
    def title_text(cls, value: str) -> str:
        return readable(value, "A card title")

    @field_validator("notes")
    @classmethod
    def notes_text(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("Notes need readable text.")
        return value.strip()


class CardChange(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)
    # Present (even as null) only when the agent should change; null means "no agent".
    agent: str | None = Field(default=None, max_length=40)

    @field_validator("title")
    @classmethod
    def title_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return readable(value, "A card title")

    @field_validator("notes")
    @classmethod
    def notes_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if "\x00" in value:
            raise ValueError("Notes need readable text.")
        return value.strip()


class NewComment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def comment_text(cls, value: str) -> str:
        return readable(value, "A comment")


@router.get("")
async def board(project: dict = Depends(current_project)):
    return await service.board(project)


@router.post("/cards", status_code=201)
async def create_card(request: NewCard, project: dict = Depends(current_project)):
    return await service.create(project, request.title, request.notes, request.agent, project["username"])


@router.get("/cards/{card_id}")
async def card(card_id: str, project: dict = Depends(current_project)):
    return await service.details(project, card_id)


@router.patch("/cards/{card_id}")
async def change_card(card_id: str, request: CardChange, project: dict = Depends(current_project)):
    change_agent = "agent" in request.model_fields_set
    return await service.update(project, card_id, request.title, request.notes, request.agent, change_agent)


@router.post("/cards/{card_id}/start")
async def start_card(card_id: str, project: dict = Depends(current_project)):
    return await service.start(project, card_id)


@router.post("/cards/{card_id}/back")
async def send_back(card_id: str, project: dict = Depends(current_project)):
    return await service.send_back(project, card_id)


@router.post("/cards/{card_id}/done")
async def finish_card(card_id: str, project: dict = Depends(current_project)):
    return await service.finish(project, card_id, project["username"])


@router.post("/cards/{card_id}/comments")
async def add_comment(card_id: str, request: NewComment, project: dict = Depends(current_project)):
    return await service.comment(project, card_id, project["username"], request.text)


@router.post("/cards/{card_id}/archive", status_code=204)
async def archive_card(card_id: str, project: dict = Depends(current_project)):
    await service.archive(project, card_id)
    return Response(status_code=204)
