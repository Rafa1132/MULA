from fastapi import APIRouter, Depends

from ..workspaces.access import current_project
from . import service

router = APIRouter(prefix="/api/knowledge")


@router.get("")
def list_entries(project: dict = Depends(current_project)):
    return {"entries": service.entries(project["id"]), "kinds": service.KIND_LABELS, "max_entries": service.MAX_ENTRIES}


@router.post("", status_code=201)
def create(value: service.EntryInput, project: dict = Depends(current_project)):
    return service.create(project["id"], value)


@router.patch("/{entry_id}")
def update(entry_id: str, value: service.EntryInput, project: dict = Depends(current_project)):
    return service.update(project["id"], entry_id, value)


@router.delete("/{entry_id}", status_code=204)
def delete(entry_id: str, project: dict = Depends(current_project)):
    service.delete(project["id"], entry_id)
