from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from ..workspaces.access import current_project
from . import filters, notes, pipeline, service
from .filters import MemoryRefused

router = APIRouter(prefix="/api/memory")


class EntryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    target: Literal["business", "owner"]
    fact: str = Field(min_length=1, max_length=filters.MAX_LENGTH * 2)


class CorrectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    fact: str = Field(min_length=1, max_length=filters.MAX_LENGTH * 2)


# A folder path: up to MAX_FOLDER_DEPTH names of up to MAX_TITLE characters, with slack for spaces.
FOLDER_LENGTH = notes.MAX_FOLDER_DEPTH * (notes.MAX_TITLE + 1) * 2


class NoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    folder: str = Field(max_length=FOLDER_LENGTH)
    title: str = Field(min_length=1, max_length=notes.MAX_TITLE * 2)
    text: str = Field(max_length=notes.MAX_TEXT * 2)


class NoteEditRequest(NoteRequest):
    # The version the editor started from; a save from a stale tab is refused with 409.
    base_version: int = Field(ge=1)


class RelinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    from_folder: str = Field(max_length=FOLDER_LENGTH)
    from_title: str = Field(min_length=1, max_length=notes.MAX_TITLE * 2)


class FolderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    folder: str = Field(min_length=1, max_length=FOLDER_LENGTH)


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    question: str = Field(min_length=1, max_length=1000)


def saved(result):
    return {"outcome": result["outcome"], "entry": result["entry"]}


@router.get("")
def list_memory(project: dict = Depends(current_project)):
    return service.overview(project["id"])


@router.post("/entries")
def add_entry(request: EntryRequest, project: dict = Depends(current_project)):
    return saved(service.owner_remember(project["id"], request.target, request.fact))


@router.post("/entries/{entry_id}/supersede")
def correct_entry(entry_id: int, request: CorrectionRequest, project: dict = Depends(current_project)):
    previous = pipeline.store_entry(project["id"], entry_id)
    if previous is None:
        raise HTTPException(404, "This memory was not found.")
    try:
        return saved(pipeline.remember(project["id"], previous["target"], request.fact, "owner", replaces=entry_id))
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal


@router.post("/entries/{entry_id}/retire")
def retire_entry(entry_id: int, project: dict = Depends(current_project)):
    return {"entry": pipeline.retire(project["id"], entry_id, "owner")}


@router.post("/search")
def search_memory(request: SearchRequest, project: dict = Depends(current_project)):
    return {"results": service.search(project["id"], request.question)}


def note_saved(project_id, result):
    """A save's outcome plus the note as it now reads, so the page needs no second request."""
    return {**result, "note": service.note(project_id, result["note_id"])}


@router.get("/graph")
def note_graph(project: dict = Depends(current_project)):
    return service.graph(project["id"])


@router.get("/notes/{note_id}")
def read_note(note_id: int, project: dict = Depends(current_project)):
    return service.note(project["id"], note_id)


@router.post("/notes", status_code=201)
def create_note(request: NoteRequest, project: dict = Depends(current_project)):
    try:
        result = pipeline.save_note(project["id"], None, request.folder, request.title, request.text, "owner")
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal
    return note_saved(project["id"], result)


@router.put("/notes/{note_id}")
def edit_note(note_id: int, request: NoteEditRequest, project: dict = Depends(current_project)):
    try:
        result = pipeline.save_note(project["id"], note_id, request.folder, request.title, request.text, "owner", request.base_version)
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal
    return note_saved(project["id"], result)


@router.post("/notes/{note_id}/relink")
def relink_note(note_id: int, request: RelinkRequest, project: dict = Depends(current_project)):
    try:
        return pipeline.relink(project["id"], note_id, request.from_folder, request.from_title, "owner")
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal


@router.post("/notes/{note_id}/archive")
def archive_note(note_id: int, project: dict = Depends(current_project)):
    return pipeline.archive_note(project["id"], note_id, "owner")


@router.post("/folders", status_code=201)
def create_folder(request: FolderRequest, project: dict = Depends(current_project)):
    try:
        return pipeline.create_folder(project["id"], request.folder, "owner")
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal
