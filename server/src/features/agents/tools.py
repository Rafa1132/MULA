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
from ..operator.runtime import HermesError
from ..team import service as team
from . import service

server = MCPServer(
    name="mula",
    instructions="Business tools for Mula agents. Pass the ticket from your instructions on every call.",
)
Ticket = Annotated[str, Field(description="The tool ticket from your instructions for this request.")]
# Failures the model can read and act on. Anything else stays an opaque crash.
EXPECTED = (service.ToolDenied, HTTPException, HermesError)


def tool_failure(error: Exception) -> ToolError:
    if isinstance(error, HTTPException):
        return ToolError(str(error.detail))
    if isinstance(error, HermesError):
        return ToolError(f"The other agent could not answer: {error}")
    return ToolError(str(error))


@server.tool(description="Operator only. Ask another Mula agent for help on the owner's behalf. Its answer arrives in the chat after your reply, once the owner's setting allows it.")
def ask_agent(ticket: Ticket,
                    agent: Annotated[Literal["forecasting"], Field(description="The agent to ask.")],
                    question: Annotated[str, Field(max_length=2000, description="A specific, self-contained question for that agent.")]) -> str:
    try:
        return service.ask_agent(ticket, agent, question)
    except EXPECTED as error:
        raise tool_failure(error) from error


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
        settings = team.settings(caller["account_id"], "forecasting")
        report = runs.save_run(caller["account_id"], forecast(request, settings["tools"]))
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
    report = runs.latest_run(caller["account_id"])["report"]
    if report is None:
        return "The owner has no saved forecasts yet."
    return json.dumps(runs.summary_for_model(report), ensure_ascii=False)


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
