"""A project's WhatsApp Business connection: connect, status, disconnect, and sending.

One number per project (table `whatsapp_connections`, server/migrations). The access token, app
secret and verify token are stored encrypted (common/secrets.py) and never returned or logged; the
owner sees the verify token once more in the status, because Meta's dashboard needs it pasted in.
Each connection has its own webhook URL, /api/channels/whatsapp/webhook/<id>, so the app secret for
the signature check is known before an event is parsed (routes.py).
"""
import hashlib
import hmac
import re
import secrets as random
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ....common import config, secrets
from ....common.database import UniqueViolation
from ...auth import accounts
from . import graph

# Bound into each ciphertext (secrets.encrypt), so a value can only be read back as what it is.
TOKEN, APP_SECRET, VERIFY = "whatsapp.access_token", "whatsapp.app_secret", "whatsapp.verify_token"
WEBHOOK_PATH = "/api/channels/whatsapp/webhook/"


class ConnectInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    phone_number_id: str = Field(max_length=30)
    waba_id: str = Field(max_length=30)
    access_token: str = Field(min_length=20, max_length=1000)
    app_secret: str = Field(min_length=16, max_length=200)
    reopen_template: str = Field(default="", max_length=512)
    reopen_language: str = Field(default="", max_length=15)

    @field_validator("phone_number_id", "waba_id")
    @classmethod
    def digits(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[0-9]{5,30}", value):
            raise ValueError("Copy the ID from Meta's WhatsApp → API Setup page: digits only.")
        return value

    @field_validator("access_token", "app_secret")
    @classmethod
    def one_word(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9_\-.|]+", value):
            raise ValueError("Paste the value exactly as Meta shows it, with no spaces.")
        return value

    @field_validator("reopen_template")
    @classmethod
    def template_name(cls, value: str) -> str:
        value = value.strip()
        if value and not re.fullmatch(r"[a-z0-9_]{1,512}", value):
            raise ValueError("A template name is lowercase letters, digits and underscores.")
        return value

    @field_validator("reopen_language")
    @classmethod
    def language(cls, value: str) -> str:
        value = value.strip()
        if value and not re.fullmatch(r"[a-z]{2,3}(_[A-Z]{2})?", value):
            raise ValueError("Use a language code such as en_US or id.")
        return value


def webhook_url(connection_id: str) -> str:
    """The URL to paste into Meta. Without MULA_PUBLIC_URL only the path is known."""
    return f"{config.MULA_PUBLIC_URL}{WEBHOOK_PATH}{connection_id}"


def row_for_project(db, project_id: str):
    return db.execute("SELECT * FROM whatsapp_connections WHERE project_id = %s", (project_id,)).fetchone()


def connection(connection_id: str):
    """A connection by its webhook id, or None (also for an id that isn't a UUID)."""
    try:
        connection_id = uuid.UUID(connection_id).hex
    except (ValueError, AttributeError, TypeError):
        return None
    with accounts.database() as db:
        return db.execute("SELECT * FROM whatsapp_connections WHERE id = %s", (connection_id,)).fetchone()


def for_project(project_id: str):
    with accounts.database() as db:
        return row_for_project(db, project_id)


def public_status(row) -> dict:
    if row is None:
        return {"connected": False, "secrets_ready": secrets.configured(), "public_url_set": bool(config.MULA_PUBLIC_URL)}
    return {
        "connected": True,
        "secrets_ready": secrets.configured(),
        "public_url_set": bool(config.MULA_PUBLIC_URL),
        "phone_number_id": row["phone_number_id"],
        "waba_id": row["waba_id"],
        # Write-only: the API says they are stored, never what they are.
        "access_token": "set",
        "app_secret": "set",
        "webhook_url": webhook_url(row["id"]),
        "verify_token": secrets.decrypt(row["verify_token"], VERIFY),
        "verified_at": row["verified_at"],
        "last_event_at": row["last_event_at"],
        "reopen_template": row["reopen_template"],
        "reopen_language": row["reopen_language"],
    }


def status(project_id: str) -> dict:
    return public_status(for_project(project_id))


def connected(project_id: str) -> bool:
    return for_project(project_id) is not None


def connect(project_id: str, value: ConnectInput) -> dict:
    """Store (or replace) the project's connection. A reconnect keeps the webhook id and verify
    token, so the URL already pasted into Meta keeps working."""
    if bool(value.reopen_template) != bool(value.reopen_language):
        raise HTTPException(422, "Give the template's name and its language together, or neither.")
    token = secrets.encrypt(value.access_token, TOKEN)
    app_secret = secrets.encrypt(value.app_secret, APP_SECRET)
    now = int(time.time())
    try:
        with accounts.database() as db:
            existing = row_for_project(db, project_id)
            if existing is None:
                db.execute("""INSERT INTO whatsapp_connections (id, project_id, phone_number_id, waba_id, access_token, app_secret, verify_token,
                                  reopen_template, reopen_language, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                           (uuid.uuid4().hex, project_id, value.phone_number_id, value.waba_id, token, app_secret,
                            secrets.encrypt(random.token_urlsafe(24), VERIFY), value.reopen_template, value.reopen_language, now))
            else:
                # A new number or app needs Meta's webhook check again.
                verified_at = existing["verified_at"]
                if existing["phone_number_id"] != value.phone_number_id:
                    verified_at = None
                db.execute("""UPDATE whatsapp_connections SET phone_number_id = %s, waba_id = %s, access_token = %s, app_secret = %s,
                                  reopen_template = %s, reopen_language = %s, verified_at = %s WHERE project_id = %s""",
                           (value.phone_number_id, value.waba_id, token, app_secret, value.reopen_template, value.reopen_language, verified_at, project_id))
    except UniqueViolation as error:
        raise HTTPException(409, "This WhatsApp number is already connected to another Mula workspace.") from error
    return status(project_id)


def disconnect(project_id: str) -> None:
    """Forget the number and its secrets. Conversations and tickets stay in the inbox."""
    with accounts.database() as db:
        deleted = db.execute("DELETE FROM whatsapp_connections WHERE project_id = %s", (project_id,)).rowcount
    if deleted == 0:
        raise HTTPException(404, "No WhatsApp number is connected.")


def require(project_id: str):
    row = for_project(project_id)
    if row is None:
        raise HTTPException(409, "Connect a WhatsApp number in Inventory first.")
    return row


async def check(project_id: str) -> dict:
    """Ask Meta whether the stored token can use the stored number (no message is sent)."""
    row = require(project_id)
    try:
        info = await graph.phone_number_info(row["phone_number_id"], secrets.decrypt(row["access_token"], TOKEN))
    except secrets.SecretUnavailable as error:
        return {"ok": False, "message": str(error) + " Connect the number again."}
    except graph.GraphError as error:
        return {"ok": False, "message": error.message}
    return {"ok": True, **info}


def verify_challenge(row, mode: str | None, token: str | None) -> bool:
    """Meta's subscription check: mode `subscribe` and the verify token, compared in constant time."""
    if mode != "subscribe" or not token:
        return False
    try:
        expected = secrets.decrypt(row["verify_token"], VERIFY)
    except secrets.SecretUnavailable:
        return False
    return hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8"))


def mark_verified(connection_id: str) -> None:
    with accounts.database() as db:
        db.execute("UPDATE whatsapp_connections SET verified_at = %s WHERE id = %s", (int(time.time()), connection_id))


def mark_event(connection_id: str) -> None:
    with accounts.database() as db:
        db.execute("UPDATE whatsapp_connections SET last_event_at = %s WHERE id = %s", (int(time.time()), connection_id))


def signature_valid(row, body: bytes, header: str | None) -> bool:
    """X-Hub-Signature-256 is `sha256=<hex HMAC of the raw body under the app secret>`."""
    if not header or not header.startswith("sha256="):
        return False
    try:
        app_secret = secrets.decrypt(row["app_secret"], APP_SECRET)
    except secrets.SecretUnavailable:
        return False
    expected = hmac.new(app_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header.removeprefix("sha256=").lower().encode("ascii", "ignore"), expected.encode("ascii"))


async def send_text(project_id: str, to: str, body: str) -> str:
    row = require(project_id)
    return await graph.send_text(row["phone_number_id"], secrets.decrypt(row["access_token"], TOKEN), to, body)


async def send_template(project_id: str, to: str) -> str:
    row = require(project_id)
    if not row["reopen_template"]:
        raise HTTPException(409, "Add an approved template's name and language to the WhatsApp connection in Inventory first.")
    return await graph.send_template(row["phone_number_id"], secrets.decrypt(row["access_token"], TOKEN), to,
                                     row["reopen_template"], row["reopen_language"])
