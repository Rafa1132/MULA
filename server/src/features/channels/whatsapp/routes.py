"""WhatsApp routes: Meta's webhook (public, no session) and the owner's connection settings.

The webhook is reached through the public HTTPS address (docker/Caddyfile.public passes /api/*).
Order matters on POST: find the connection by the URL's id, check X-Hub-Signature-256 over the raw
body with that connection's app secret, and only then parse. Events for another Phone Number ID
are ignored, so a message reaches only the workspace that owns the number. Work is done in a
background task after a quick 200, so Meta doesn't retry; retries that still happen are dropped
by the message-id duplicate check (support.record_inbound).
"""
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.responses import PlainTextResponse

from ...support import service as support
from ...workspaces.access import current_project
from . import service

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_BODY_BYTES = 1_000_000
TEXT_TYPES = {"text"}

# How the support feature sends on this channel.
support.SENDERS["whatsapp"] = {"text": service.send_text, "template": service.send_template}


@router.get("/api/channels/whatsapp/webhook/{connection_id}")
def verify(connection_id: str, request: Request):
    """Meta's subscription check: echo hub.challenge when the verify token matches."""
    params = request.query_params
    row = service.connection(connection_id)
    # The same answer for an unknown connection and a wrong token, so ids can't be probed.
    if row is None or not service.verify_challenge(row, params.get("hub.mode"), params.get("hub.verify_token")):
        raise HTTPException(403, "Verification failed.")
    service.mark_verified(row["id"])
    return PlainTextResponse(params.get("hub.challenge", "")[:200])


async def read_body(request: Request) -> bytes:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise HTTPException(413, "Too large.")
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            raise HTTPException(413, "Too large.")
    return body


def message_body(message: dict) -> tuple[str, bool]:
    """The text of a message, and whether it is one Mula can read (text only, for now)."""
    kind = message.get("type")
    if kind in TEXT_TYPES:
        text = message.get("text", {}).get("body", "")
        if isinstance(text, str):
            return text, True
    return f"[{str(kind)[:20]} message]", False


def timestamp(value) -> int | None:
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def handle_change(row, value: dict, tasks: BackgroundTasks) -> None:
    metadata = value.get("metadata") or {}
    if metadata.get("phone_number_id") != row["phone_number_id"]:
        # Signed with this app's secret but for another number: never delivered to this workspace.
        logger.warning("whatsapp: ignored an event for a different phone number id")
        return
    names = {}
    for contact in value.get("contacts") or []:
        if isinstance(contact, dict) and isinstance(contact.get("wa_id"), str):
            names[contact["wa_id"]] = str((contact.get("profile") or {}).get("name", ""))
    for message in value.get("messages") or []:
        if not isinstance(message, dict):
            continue
        sender, external_id = message.get("from"), message.get("id")
        if not isinstance(sender, str) or not sender.isdigit() or not isinstance(external_id, str) or not external_id:
            continue
        body, supported = message_body(message)
        stored = support.record_inbound(row["project_id"], "whatsapp", sender, names.get(sender, ""), external_id, body,
                                        timestamp(message.get("timestamp")), supported)
        if stored is None:
            logger.info("whatsapp: duplicate message dropped")
            continue
        tasks.add_task(support.process, *stored)
    for status in value.get("statuses") or []:
        if not isinstance(status, dict) or not isinstance(status.get("id"), str):
            continue
        error = ""
        errors = status.get("errors") or []
        if errors and isinstance(errors[0], dict):
            error = str(errors[0].get("title") or errors[0].get("code") or "")
        support.record_status(row["project_id"], status["id"], str(status.get("status", "")), error)


@router.post("/api/channels/whatsapp/webhook/{connection_id}")
async def receive(connection_id: str, request: Request, tasks: BackgroundTasks):
    row = service.connection(connection_id)
    if row is None:
        raise HTTPException(404, "Unknown webhook.")
    body = await read_body(request)
    if not service.signature_valid(row, body, request.headers.get("x-hub-signature-256")):
        logger.warning("whatsapp: rejected a webhook call with a bad signature")
        raise HTTPException(401, "Invalid signature.")
    try:
        payload = json.loads(body)
    except ValueError as error:
        raise HTTPException(400, "Invalid JSON.") from error
    service.mark_event(row["id"])
    if not isinstance(payload, dict) or payload.get("object") != "whatsapp_business_account":
        return Response(status_code=200)
    for entry in payload.get("entry") or []:
        for change in (entry or {}).get("changes") or []:
            if isinstance(change, dict) and change.get("field") == "messages" and isinstance(change.get("value"), dict):
                handle_change(row, change["value"], tasks)
    return Response(status_code=200)


@router.get("/api/channels/whatsapp")
def status(project: dict = Depends(current_project)):
    return service.status(project["id"])


@router.put("/api/channels/whatsapp")
def connect(value: service.ConnectInput, project: dict = Depends(current_project)):
    return service.connect(project["id"], value)


@router.delete("/api/channels/whatsapp", status_code=204)
def disconnect(project: dict = Depends(current_project)):
    service.disconnect(project["id"])


@router.post("/api/channels/whatsapp/check")
async def check(project: dict = Depends(current_project)):
    return await service.check(project["id"])
