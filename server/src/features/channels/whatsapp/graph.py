"""Calls to Meta's Graph API for WhatsApp: sending messages and checking a number.

Only this module talks to graph.facebook.com. The access token goes in the Authorization header and
is never logged; errors carry Meta's error code and title, never the request or the token.
429 and 5xx answers are retried with backoff (honouring Retry-After); other errors are not.
"""
import asyncio
import logging

import httpx
# Bound at import: tests patch httpx.AsyncClient for the model runtime (tests/support/runtime_fixture),
# and Graph calls must keep going only through `_transport` below.
from httpx import AsyncClient

from ....common import config

logger = logging.getLogger(__name__)

GRAPH = "https://graph.facebook.com"
TIMEOUT_SECONDS = 15
# Waits before each retry; three retries after the first try.
BACKOFF_SECONDS = (1, 2, 4)
MAX_RETRY_AFTER_SECONDS = 30
# Tests replace these to answer without a network and without waiting.
_transport: httpx.AsyncBaseTransport | None = None
_sleep = asyncio.sleep


class GraphError(Exception):
    """A refused or failed Graph call. `message` is safe to show the owner."""

    def __init__(self, message: str, status: int = 0, code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def url(path: str) -> str:
    return f"{GRAPH}/{config.MULA_WHATSAPP_GRAPH_VERSION}/{path}"


def retryable(status: int) -> bool:
    return status == 429 or status >= 500


def error_from(response: httpx.Response) -> GraphError:
    code = None
    title = "Meta refused the request."
    try:
        error = response.json().get("error", {})
        code = error.get("code")
        # error_user_title / message are Meta's own wording; they never contain the token.
        detail = error.get("error_user_title") or error.get("message")
        if isinstance(detail, str) and detail:
            title = detail[:200]
    except ValueError:
        pass
    if response.status_code in (401, 403) or code == 190:
        title = "Meta rejected the access token. Use a permanent system user token with WhatsApp permissions."
    return GraphError(title, response.status_code, code)


def wait_for(response: httpx.Response | None, attempt: int) -> float:
    if response is not None:
        header = response.headers.get("retry-after", "")
        if header.isdigit():
            return min(int(header), MAX_RETRY_AFTER_SECONDS)
    return BACKOFF_SECONDS[attempt]


async def request(method: str, path: str, token: str, payload: dict | None = None, params: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    async with AsyncClient(timeout=TIMEOUT_SECONDS, transport=_transport) as client:
        for attempt in range(len(BACKOFF_SECONDS) + 1):
            response = None
            try:
                response = await client.request(method, url(path), headers=headers, json=payload, params=params)
            except httpx.RequestError as error:
                failure = GraphError("Meta's Graph API couldn't be reached.")
                logger.warning("Graph %s %s: %s (attempt %d)", method, path.split("/")[-1], type(error).__name__, attempt + 1)
            else:
                if response.is_success:
                    return response.json()
                failure = error_from(response)
                logger.warning("Graph %s %s: status %d code %s (attempt %d)", method, path.split("/")[-1], response.status_code, failure.code, attempt + 1)
                if not retryable(response.status_code):
                    raise failure
            if attempt == len(BACKOFF_SECONDS):
                raise failure
            await _sleep(wait_for(response, attempt))
    raise GraphError("Meta's Graph API couldn't be reached.")


async def send_text(phone_number_id: str, token: str, to: str, body: str) -> str:
    """Send a free-form text message; returns Meta's message id (wamid)."""
    payload = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": "text",
               "text": {"preview_url": False, "body": body}}
    result = await request("POST", f"{phone_number_id}/messages", token, payload)
    return message_id(result)


async def send_template(phone_number_id: str, token: str, to: str, name: str, language: str) -> str:
    """Send an approved template with no parameters, for outside the 24-hour window."""
    payload = {"messaging_product": "whatsapp", "to": to, "type": "template", "template": {"name": name, "language": {"code": language}}}
    result = await request("POST", f"{phone_number_id}/messages", token, payload)
    return message_id(result)


def message_id(result: dict) -> str:
    messages = result.get("messages")
    if not isinstance(messages, list) or not messages or not isinstance(messages[0].get("id"), str):
        raise GraphError("Meta accepted the message but sent no message id.")
    return messages[0]["id"]


async def phone_number_info(phone_number_id: str, token: str) -> dict:
    """The number's display form and verified name: proves the token can use this number."""
    result = await request("GET", phone_number_id, token, params={"fields": "display_phone_number,verified_name"})
    return {"display_phone_number": str(result.get("display_phone_number", "")), "verified_name": str(result.get("verified_name", ""))}
