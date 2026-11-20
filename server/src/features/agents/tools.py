"""The MCP tool server the Mula runtime calls for agent tools, mounted at /mcp.

The runtime authenticates with the shared MULA_TOOLS_KEY. Each call also
carries the per-turn ticket from the agent's system prompt (see service.py),
which decides the account, which agent is calling and what it may do.
"""
from contextlib import asynccontextmanager
import hmac
import json
from typing import Annotated, Literal

from fastapi import HTTPException
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from ...common import config
from ..forecasting import runs
from ..forecasting.service import ForecastRequest, forecast
from ..memory import pipeline as memory
from ..memory.filters import MemoryRefused
from ..operator.runtime import HermesError
from ..orchestrator import proposals
from ..team import service as team
from . import service

server = MCPServer(
    name="mula",
    instructions="Business tools for Mula agents. Pass the ticket from your instructions on every call.",
)
Ticket = Annotated[str, Field(description="The tool ticket from your instructions for this request.")]
# Failures the model can read and act on. Anything else stays an opaque crash.
EXPECTED = (service.ToolDenied, HTTPException, HermesError, MemoryRefused)


def tool_failure(error: Exception) -> ToolError:
    if isinstance(error, HTTPException):
        return ToolError(str(error.detail))
    if isinstance(error, MemoryRefused):
        return ToolError(f"Not saved. {error}")
    if isinstance(error, HermesError):
        return ToolError(f"The other agent could not answer: {error}")
    return ToolError(str(error))


@server.tool(description="Ask another Mula agent for help on the owner's behalf, only one your instructions name. Its answer arrives in the chat after your reply, once the owner's setting allows it.")
def ask_agent(ticket: Ticket,
                    # Any agent id; the owner's links in My agents decide which ones this caller may ask.
                    agent: Annotated[str, Field(max_length=40, description="The id of the agent to ask, exactly as your instructions give it.")],
                    question: Annotated[str, Field(max_length=2000, description="A specific, self-contained question for that agent.")]) -> str:
    try:
        return service.ask_agent(ticket, agent, question)
    except EXPECTED as error:
        raise tool_failure(error) from error


@server.tool(description="Operator only. Save one durable fact to the owner's memory: about the business, or about the owner. Pass replaces with a memory id when the fact corrects an earlier one. Never save secrets, card or identity numbers, or other people's contact details.",
             annotations=ToolAnnotations(destructive_hint=False, open_world_hint=False))
def remember(ticket: Ticket,
             target: Annotated[Literal["business", "owner"], Field(description="What the fact is about.")],
             fact: Annotated[str, Field(max_length=1000, description="One short fact in plain words, at most 500 characters.")],
             replaces: Annotated[int | None, Field(ge=1, description="The id of the memory this fact replaces, when correcting one.")] = None) -> str:
    try:
        caller = service.resolve_ticket(ticket, "remember")
        settings = team.settings(caller["project_id"], "operator")
        if "memory_write" not in settings["tools"]:
            raise service.ToolDenied("The owner has turned off saving to memory. Do not claim to have saved anything.")
        result = memory.remember(caller["project_id"], target, fact, "operator", origin_message_id=caller["message_id"], replaces=replaces)
    except EXPECTED as error:
        raise tool_failure(error) from error
    entry = result["entry"]
    if result["outcome"] == "duplicate":
        return f"Already in memory as [{entry['id']}]: {entry['fact']}"
    if replaces is not None:
        return f"Saved as memory [{entry['id']}], replacing [{replaces}]."
    return f"Saved as memory [{entry['id']}]."


@server.tool(description="Forecasting agent only; the Operator uses ask_agent instead. Calculate a statistical forecast from the CSV attached to this request and save it to the owner's forecast history.",
             annotations=ToolAnnotations(destructive_hint=False, open_world_hint=False))
def calculate_forecast(ticket: Ticket,
                       date_column: Annotated[str, Field(max_length=2000, description="Column holding YYYY-MM-DD dates.")],
                       value_column: Annotated[str, Field(max_length=2000, description="Column holding the numeric values.")],
                       frequency: Literal["daily", "weekly", "monthly"] = "daily",
                       horizon: Annotated[int, Field(ge=1, le=90, description="Periods to forecast.")] = 7,
                       method: Literal["auto", "naive", "moving_average", "exponential_smoothing", "seasonal_naive", "drift"] = "auto") -> str:
    try:
        caller = service.resolve_ticket(ticket, "calculate_forecast")
        if caller["attachment"] is None:
            raise service.ToolDenied("No CSV is attached to this request. Ask the owner to attach one.")
        request = ForecastRequest(csv_file=caller["attachment"], date_column=date_column, value_column=value_column,
                                  frequency=frequency, horizon=horizon, method=method)
        settings = team.settings(caller["project_id"], "forecasting")
        report = runs.save_run(caller["project_id"], forecast(request, settings["tools"]))
    except EXPECTED as error:
        raise tool_failure(error) from error
    return json.dumps(runs.summary_for_model(report), ensure_ascii=False)


@server.tool(description="Forecasting agent only. Read the owner's most recent saved forecast report.",
             annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False))
def latest_forecast(ticket: Ticket) -> str:
    try:
        caller = service.resolve_ticket(ticket, "latest_forecast")
    except EXPECTED as error:
        raise tool_failure(error) from error
    report = runs.latest_run(caller["project_id"])["report"]
    if report is None:
        return "The owner has no saved forecasts yet."
    return json.dumps(runs.summary_for_model(report), ensure_ascii=False)


@server.tool(description="Workspace assistant only. Propose a new project (a separate business) when the owner asks for one. It creates nothing: the owner confirms with a button under your reply.",
             annotations=ToolAnnotations(destructive_hint=False, open_world_hint=False))
def create_project(ticket: Ticket,
                   name: Annotated[str, Field(max_length=160, description="A short project name, usually the business's name.")],
                   description: Annotated[str | None, Field(max_length=600, description="One line about the business, if you know it.")] = None) -> str:
    try:
        proposal = proposals.propose(ticket, name, description)
    except EXPECTED as error:
        raise tool_failure(error) from error
    return (f"Proposed “{proposal['name']}”. It is not created yet: tell the owner to press Create project "
            "under your reply to create it, or Not now to dismiss it.")


class ToolGateway:
    """The /mcp endpoint: refuses requests without the runtime's shared key, then serves the tools.

    The MCP app's session manager can run only once, so each app startup
    builds a fresh one with `running()`.
    """

    def __init__(self):
        self.app = None

    @asynccontextmanager
    async def running(self):
        # Stateless JSON responses: every call is self-contained and carries its ticket.
        self.app = server.streamable_http_app(streamable_http_path="/", stateless_http=True, json_response=True)
        try:
            async with server.session_manager.run():
                yield
        finally:
            self.app = None

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return
        if not self.authorized(scope):
            await self.refuse(send, 401, "Agent tools are not connected.")
            return
        if self.app is None:
            await self.refuse(send, 503, "Agent tools are starting. Try again shortly.")
            return
        await self.app(scope, receive, send)

    @staticmethod
    async def refuse(send, status, detail):
        body = json.dumps({"detail": detail}).encode()
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": body})

    @staticmethod
    def authorized(scope):
        # An unset key disables the tools entirely rather than accepting an empty secret.
        if not config.MULA_TOOLS_KEY:
            return False
        headers = dict(scope.get("headers") or [])
        supplied = headers.get(b"authorization", b"")
        expected = f"Bearer {config.MULA_TOOLS_KEY}".encode()
        return hmac.compare_digest(supplied, expected)


gateway = ToolGateway()
