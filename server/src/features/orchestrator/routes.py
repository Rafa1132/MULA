"""Onboarding and the orchestrator chat. Every route belongs to the signed-in account alone: none
takes a project, and USER.md, the personality and the chat are never readable by another account."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth import accounts
from . import assistant, onboarding, proposals, user_file

router = APIRouter()

Step = Literal["assistant_name", "name", "business", "help", "style", "summary", "personality"]


class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step: Step
    answer: str = Field(max_length=2000)


class SkipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step: Step


class About(BaseModel):
    """The four USER.md answers; empty or missing means not given. Lengths are checked in user_file."""
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, max_length=2000)
    business: str | None = Field(default=None, max_length=2000)
    help: str | None = Field(default=None, max_length=2000)
    style: str | None = Field(default=None, max_length=2000)


class SummaryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # None accepts the summary as it is.
    about: About | None = None


class Personality(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tone: str | None = None
    formality: str | None = None
    language: str | None = None
    emoji: str | None = None


class AssistantSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Blank goes back to the default name. Checked in onboarding.clean_assistant_name.
    name: str | None = Field(default=None, max_length=200)
    propose_projects: bool = True


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=8000)

    @field_validator("message")
    @classmethod
    def reject_blank_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message must contain non-whitespace text.")
        return value


@router.get("/api/onboarding")
def onboarding_state(account: dict = Depends(accounts.current_account)):
    return onboarding.state(account["id"])


@router.post("/api/onboarding/answer")
def answer(request: AnswerRequest, account: dict = Depends(accounts.current_account)):
    return onboarding.answer(account["id"], request.step, request.answer)


@router.post("/api/onboarding/skip")
def skip(request: SkipRequest, account: dict = Depends(accounts.current_account)):
    return onboarding.skip(account["id"], request.step)


@router.post("/api/onboarding/skip-all")
def skip_all(account: dict = Depends(accounts.current_account)):
    return onboarding.skip_all(account["id"])


@router.post("/api/onboarding/summary")
def confirm_summary(request: SummaryRequest, account: dict = Depends(accounts.current_account)):
    answers = None
    if request.about is not None:
        answers = request.about.model_dump()
    return onboarding.confirm_summary(account["id"], answers)


@router.post("/api/onboarding/personality")
def choose_personality(request: Personality, account: dict = Depends(accounts.current_account)):
    return onboarding.choose_personality(account["id"], request.model_dump())


@router.post("/api/onboarding/welcome")
def welcome_heard(account: dict = Depends(accounts.current_account)):
    """The owner started the spoken welcome, or chose to read it: it won't be offered again."""
    return onboarding.mark_welcome_heard(account["id"])


@router.post("/api/onboarding/restart")
def restart(account: dict = Depends(accounts.current_account)):
    return onboarding.restart(account["id"])


@router.get("/api/orchestrator/profile")
def profile(account: dict = Depends(accounts.current_account)):
    return {"about": user_file.read_about(account["id"]), "personality": onboarding.personality_of(account["id"])}


@router.put("/api/orchestrator/profile")
def save_profile(request: About, account: dict = Depends(accounts.current_account)):
    return {"about": user_file.save_all(account["id"], request.model_dump())}


@router.put("/api/orchestrator/personality")
def save_personality(request: Personality, account: dict = Depends(accounts.current_account)):
    return {"personality": onboarding.set_personality(account["id"], request.model_dump())}


@router.get("/api/orchestrator/assistant")
def assistant_settings(account: dict = Depends(accounts.current_account)):
    return onboarding.assistant_settings(account["id"])


@router.put("/api/orchestrator/assistant")
def save_assistant_settings(request: AssistantSettings, account: dict = Depends(accounts.current_account)):
    return onboarding.save_assistant_settings(account["id"], request.name, request.propose_projects)


@router.get("/api/orchestrator/conversation")
def conversation(account: dict = Depends(accounts.current_account)):
    return {"messages": assistant.history(account["id"]), "proposals": proposals.for_account(account["id"])}


@router.post("/api/orchestrator/proposals/{proposal_id}/confirm")
def confirm_proposal(proposal_id: str, account: dict = Depends(accounts.current_account)):
    """Create the proposed project. The account is the session's; the proposal must be its own."""
    return proposals.confirm(account["id"], proposal_id)


@router.post("/api/orchestrator/proposals/{proposal_id}/decline")
def decline_proposal(proposal_id: str, account: dict = Depends(accounts.current_account)):
    return proposals.decline(account["id"], proposal_id)


@router.post("/api/orchestrator/chat")
async def chat(request: ChatRequest, account: dict = Depends(accounts.current_account)):
    return await assistant.reply(account["id"], request.message)
