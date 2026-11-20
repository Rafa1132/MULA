from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from ..auth import accounts
from . import service
from .access import current_project

router = APIRouter(prefix="/api")


class ProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    # Optional: a project without a name shows as "Untitled project" until it is renamed.
    name: str | None = Field(default=None, max_length=service.MAX_NAME * 2)


class NewProjectRequest(ProjectRequest):
    description: str | None = Field(default=None, max_length=service.MAX_DESCRIPTION * 2)


@router.get("/workspace")
def workspace(account: dict = Depends(accounts.current_account)):
    with service.database() as db:
        row = service.workspace_of(db, account["id"])
    return {"id": row["id"], "name": row["name"], "projects": service.projects_for(account["id"]), "max_projects": service.MAX_PROJECTS}


@router.get("/projects")
def list_projects(account: dict = Depends(accounts.current_account)):
    return service.projects_for(account["id"])


@router.post("/projects", status_code=201)
def create_project(request: NewProjectRequest, account: dict = Depends(accounts.current_account)):
    return service.create_project(account["id"], request.name, request.description)


@router.patch("/projects/{project_id}")
def rename_project(project_id: str, request: ProjectRequest, account: dict = Depends(accounts.current_account)):
    return service.rename_project(account["id"], project_id, request.name)


@router.get("/project")
def project(project: dict = Depends(current_project)):
    """The project this request is for (from the X-Mula-Project header)."""
    return {"id": project["id"], "name": project["name"], "display_name": project["display_name"], "role": project["role"]}
