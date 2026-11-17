from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from ..auth import accounts
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
def list_memory(account: dict = Depends(accounts.current_account)):
    return service.overview(account["id"])


@router.post("/entries")
def add_entry(request: EntryRequest, account: dict = Depends(accounts.current_account)):
    return saved(service.owner_remember(account["id"], request.target, request.fact))


@router.post("/entries/{entry_id}/supersede")
def correct_entry(entry_id: int, request: CorrectionRequest, account: dict = Depends(accounts.current_account)):
    previous = pipeline.store_entry(account["id"], entry_id)
    if previous is None:
        raise HTTPException(404, "This memory was not found.")
    try:
        return saved(pipeline.remember(account["id"], previous["target"], request.fact, "owner", replaces=entry_id))
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal


@router.post("/entries/{entry_id}/retire")
def retire_entry(entry_id: int, account: dict = Depends(accounts.current_account)):
    return {"entry": pipeline.retire(account["id"], entry_id, "owner")}


@router.post("/search")
def search_memory(request: SearchRequest, account: dict = Depends(accounts.current_account)):
    return {"results": service.search(account["id"], request.question)}


def note_saved(account_id, result):
    """A save's outcome plus the note as it now reads, so the page needs no second request."""
    return {**result, "note": service.note(account_id, result["note_id"])}


@router.get("/graph")
def note_graph(account: dict = Depends(accounts.current_account)):
    return service.graph(account["id"])


@router.get("/notes/{note_id}")
def read_note(note_id: int, account: dict = Depends(accounts.current_account)):
    return service.note(account["id"], note_id)


@router.post("/notes", status_code=201)
def create_note(request: NoteRequest, account: dict = Depends(accounts.current_account)):
    try:
        result = pipeline.save_note(account["id"], None, request.folder, request.title, request.text, "owner")
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal
    return note_saved(account["id"], result)


@router.put("/notes/{note_id}")
def edit_note(note_id: int, request: NoteEditRequest, account: dict = Depends(accounts.current_account)):
    try:
        result = pipeline.save_note(account["id"], note_id, request.folder, request.title, request.text, "owner", request.base_version)
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal
    return note_saved(account["id"], result)


@router.post("/notes/{note_id}/relink")
def relink_note(note_id: int, request: RelinkRequest, account: dict = Depends(accounts.current_account)):
    try:
        return pipeline.relink(account["id"], note_id, request.from_folder, request.from_title, "owner")
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal


@router.post("/notes/{note_id}/archive")
def archive_note(note_id: int, account: dict = Depends(accounts.current_account)):
    return pipeline.archive_note(account["id"], note_id, "owner")


@router.post("/folders", status_code=201)
def create_folder(request: FolderRequest, account: dict = Depends(accounts.current_account)):
    try:
        return pipeline.create_folder(account["id"], request.folder, "owner")
    except MemoryRefused as refusal:
        raise HTTPException(422, str(refusal)) from refusal
