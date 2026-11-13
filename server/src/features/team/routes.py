from fastapi import APIRouter, Depends
from ..auth import accounts
from . import service

router = APIRouter()


@router.get("/api/team")
def team(account: dict = Depends(accounts.current_account)):
    return {"agents": [service.settings(account["id"], agent_id) for agent_id in service.AGENTS]}


@router.put("/api/team/{agent_id}")
def update(agent_id: str, value: service.SettingsInput, account: dict = Depends(accounts.current_account)):
    return service.save(account["id"], agent_id, value)
