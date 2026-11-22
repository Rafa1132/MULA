from fastapi import APIRouter, Depends
from ..workspaces.access import current_project
from ..operator.runtime import HermesError, configured_models
from ...common import brains
from . import service

router = APIRouter()


async def brain_statuses() -> dict[str, str]:
    """`ready`, `needs_setup`, or `unchecked` when the runtime cannot be reached."""
    try:
        served = await configured_models()
    except HermesError:
        served = None
    statuses = {}
    for brain_id, brain in brains.BRAINS.items():
        if brain_id == brains.DEFAULT_BRAIN:
            # The default is the gateway's own model; it is not a separate route.
            statuses[brain_id] = "ready"
        elif served is None:
            statuses[brain_id] = "unchecked"
        elif brain["alias"] in served:
            statuses[brain_id] = "ready"
        else:
            statuses[brain_id] = "needs_setup"
    return statuses


async def with_brain_statuses(agents: list[dict]) -> list[dict]:
    statuses = await brain_statuses()
    for agent in agents:
        for brain_id, brain in agent["available_brains"].items():
            brain["status"] = statuses[brain_id]
    return agents


@router.get("/api/team")
async def team(project: dict = Depends(current_project)):
    agents = [service.settings(project["id"], agent_id) for agent_id in service.project_agent_ids(project["id"])]
    return {"agents": await with_brain_statuses(agents), "layout": service.layout(project["id"]),
            "templates": service.available_templates(project["id"])}


# Registered before /api/team/{agent_id}, like the layout routes.
@router.post("/api/team/templates/{agent_id}", status_code=201)
async def add_template(agent_id: str, value: service.TemplateInput, project: dict = Depends(current_project)):
    added = service.add_template(project["id"], agent_id, value)
    return (await with_brain_statuses([added]))[0]


# Registered before /api/team/{agent_id} so "layout" is never read as an agent id.
@router.put("/api/team/layout")
def save_layout(value: service.LayoutInput, project: dict = Depends(current_project)):
    return {"layout": service.save_layout(project["id"], value)}


@router.delete("/api/team/layout")
def reset_layout(project: dict = Depends(current_project)):
    return {"layout": service.reset_layout(project["id"])}


@router.put("/api/team/{agent_id}")
async def update(agent_id: str, value: service.SettingsInput, project: dict = Depends(current_project)):
    saved = service.save(project["id"], agent_id, value)
    return (await with_brain_statuses([saved]))[0]


@router.delete("/api/team/{agent_id}", status_code=204)
def remove(agent_id: str, project: dict = Depends(current_project)):
    service.remove_template(project["id"], agent_id)


@router.put("/api/team/{agent_id}/support")
def save_support(agent_id: str, value: service.SupportInput, project: dict = Depends(current_project)):
    return service.save_support(project["id"], agent_id, value)
