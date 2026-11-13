from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from ..auth import accounts
from . import service

router = APIRouter(prefix="/api/memory")


class DocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    path: str = Field(min_length=1, max_length=100)
    content: str = Field(max_length=8000)
    revision: str = Field(max_length=64)


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    question: str = Field(min_length=1, max_length=1000)


@router.get("")
def list_memory(account: dict = Depends(accounts.current_account)):
    return service.overview(account["id"])


@router.put("/document")
def save_document(request: DocumentRequest, account: dict = Depends(accounts.current_account)):
    return service.write_document(account["id"], request.path, request.content, request.revision)


@router.post("/search")
def search_memory(request: SearchRequest, account: dict = Depends(accounts.current_account)):
    return {"results": service.search(account["id"], request.question)}
