import re
from fastapi import APIRouter, Cookie, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from ...common import config
from . import accounts
from ..orchestrator import assistant as orchestrator

router = APIRouter()

USERNAME_RULE = "Use 3–40 letters, numbers, dots, underscores or hyphens."
PASSWORD_RULE = "Use at least 10 characters."


class Credentials(BaseModel):
    """Sign-up and sign-in fields. The strict rules apply unless MULA_RELAXED_AUTH is on (local
    development only), which accepts anything non-empty; the length caps always apply."""
    model_config = ConfigDict(extra="forbid")
    username: str = Field(max_length=40)
    password: str = Field(max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Enter a username.")
        if not config.MULA_RELAXED_AUTH and not re.fullmatch(r"[a-z0-9_.-]{3,40}", value):
            raise ValueError(USERNAME_RULE)
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        if not value:
            raise ValueError("Enter a password.")
        if not config.MULA_RELAXED_AUTH and len(value) < 10:
            raise ValueError(PASSWORD_RULE)
        return value


def set_login(response: Response, token: str):
    response.set_cookie(accounts.COOKIE, token, httponly=True, samesite="strict",
                        secure=config.SECURE_COOKIES,
                        max_age=accounts.SESSION_SECONDS, path="/")


@router.post("/api/auth/signup", status_code=201)
def signup(credentials: Credentials, response: Response):
    token, account = accounts.create_account(credentials.username, credentials.password)
    set_login(response, token)
    # The orchestrator's runtime profile, so its first message doesn't wait for the gateway.
    orchestrator.provision(account["id"])
    return account


@router.post("/api/auth/login")
def login(credentials: Credentials, response: Response):
    token, account = accounts.authenticate(credentials.username, credentials.password)
    set_login(response, token)
    return account


@router.get("/api/auth/rules")
def rules():
    """Which sign-up rules the form should show; public, and says nothing about any account."""
    return {"relaxed": config.MULA_RELAXED_AUTH}


@router.get("/api/auth/me")
def me(account: dict = Depends(accounts.current_account)):
    return account


@router.post("/api/auth/logout")
def logout(response: Response, mula_session: str | None = Cookie(default=None)):
    accounts.logout(mula_session)
    response.delete_cookie(accounts.COOKIE, path="/", httponly=True, samesite="strict")
    return {"status": "ok"}


