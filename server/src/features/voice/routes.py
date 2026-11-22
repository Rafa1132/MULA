from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from ..auth import accounts
from ..orchestrator import onboarding
from . import service as speech
from . import welcome

router = APIRouter()


class SpeechRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=1200)

    @field_validator("text")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        value = value.strip()
        if not value or "\x00" in value:
            raise ValueError("Speech needs readable text.")
        return value


@router.post("/api/speech")
async def create_speech(request: SpeechRequest, account: dict = Depends(accounts.current_account)):
    audio = await speech.synthesize(request.text)
    return Response(audio, media_type=speech.media_type(), headers={"Cache-Control": "no-store"})


@router.get("/api/speech/welcome")
async def welcome_speech(account: dict = Depends(accounts.current_account)):
    """The spoken welcome for new accounts. Fixed text, so the audio is made once and reused."""
    audio = await welcome.welcome_audio(onboarding.WELCOME)
    return Response(audio, media_type=speech.media_type(), headers={"Cache-Control": "private, max-age=86400"})
