from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from ..auth import accounts
from . import filters, pipeline, service
from .filters import MemoryRefused

router = APIRouter(prefix="/api/memory")


class EntryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    target: Literal["business", "owner"]
    fact: str = Field(min_length=1, max_length=filters.MAX_LENGTH * 2)


class CorrectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    fact: str = Field(min_length=1, max_length=filters.MAX_LENGTH * 2)


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
