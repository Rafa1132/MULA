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
from ...common.agent_catalog import CATALOG
from ..board import service as board
from ..knowledge import service as knowledge
from ..forecasting import runs
from ..forecasting.service import ForecastRequest, forecast
from ..memory import pipeline as memory
from ..memory.filters import MemoryRefused
from ..operator.runtime import HermesError
from ..orchestrator import proposals
from ..support import service as support
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


BoardCard = Annotated[str, Field(max_length=40, description="The card id from board_list, for example t_ae9b8693.")]


def tool_board_line(card: dict) -> str:
    agent = card["agent"] or "no agent"
    return f"{card['id']} [{card['column']}] {card['title']} ({agent})"


@server.tool(description="List the cards on this project's Board, grouped as todo, working, needs_you and done, with each card's id and agent.",
             annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False))
async def board_list(ticket: Ticket) -> str:
    try:
        caller = service.resolve_ticket(ticket, "board_list")
        result = await board.board(board.project_for_tools(caller["project_id"]))
    except EXPECTED as error:
        raise tool_failure(error) from error
    if not result["cards"]:
        return "The Board has no cards yet."
    return "\n".join(tool_board_line(card) for card in result["cards"])


@server.tool(description="Add a card to this project's Board when the owner asks for a task to be tracked. It waits in To do: nothing runs until the owner presses Start on the Board page. Assign it to one of the project's agents by id, or leave it unassigned.",
             annotations=ToolAnnotations(destructive_hint=False, open_world_hint=False))
async def board_add_card(ticket: Ticket,
                         title: Annotated[str, Field(min_length=1, max_length=200, description="A short title for the task.")],
                         notes: Annotated[str, Field(max_length=4000, description="What needs doing and any details the owner gave.")] = "",
                         agent: Annotated[str | None, Field(max_length=40, description="The id of the agent that should do it, or null.")] = None) -> str:
    try:
        caller = service.resolve_ticket(ticket, "board_add_card")
        card = await board.create(board.project_for_tools(caller["project_id"]), title.strip(), notes.strip(), agent,
                                  CATALOG[caller["agent_id"]]["name"])
    except EXPECTED as error:
        raise tool_failure(error) from error
    return (f"Added card {card['id']} “{card['title']}” to To do. It does not run until the owner presses Start "
            "on the Board page; tell them so.")


@server.tool(description="Add a comment to a card on this project's Board, for example a note the owner wants recorded.",
             annotations=ToolAnnotations(destructive_hint=False, open_world_hint=False))
async def board_comment(ticket: Ticket, card: BoardCard,
                        text: Annotated[str, Field(min_length=1, max_length=2000, description="The comment.")]) -> str:
    try:
        caller = service.resolve_ticket(ticket, "board_comment")
        await board.comment(board.project_for_tools(caller["project_id"]), card, CATALOG[caller["agent_id"]]["name"], text.strip())
    except EXPECTED as error:
        raise tool_failure(error) from error
    return f"Commented on {card}."


def require_capability(caller: dict, capability: str) -> None:
    """The owner's switch for this tool in My agents (`capabilities` in the agent's file)."""
    if capability not in team.settings(caller["project_id"], caller["agent_id"])["tools"]:
        raise service.ToolDenied("The owner switched this tool off in My agents.")


@server.tool(description="Customer Service only. Search the business's knowledge base (FAQ, products and services, opening hours, policies). Answer customers only from what it returns.",
             annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False))
def knowledge_search(ticket: Ticket,
                     query: Annotated[str, Field(min_length=1, max_length=300, description="What the customer is asking about, in a few words.")]) -> str:
    try:
        caller = service.resolve_ticket(ticket, "knowledge_search")
        require_capability(caller, "knowledge_read")
    except EXPECTED as error:
        raise tool_failure(error) from error
    found = knowledge.search(caller["project_id"], query.strip())
    if not found:
        return "No knowledge base entry matches. Do not guess: hand off with handoff_create."
    return "Knowledge base entries (the only facts you may state):\n" + knowledge.format_entries(found)


@server.tool(description="Customer Service only. Hand the conversation to a person on the business's team: opens a ticket in the owner's inbox. Use it when the knowledge base doesn't answer, or for orders, refunds, changes, personal data, files or complaints.",
             annotations=ToolAnnotations(destructive_hint=False, open_world_hint=False))
def handoff_create(ticket: Ticket,
                   reason: Annotated[str, Field(min_length=1, max_length=500, description="Why a person is needed, in one sentence.")],
                   summary: Annotated[str, Field(min_length=1, max_length=2000, description="What the customer wants and what you already told them.")]) -> str:
    try:
        caller = service.resolve_ticket(ticket, "handoff_create")
        require_capability(caller, "handoff")
        support.handoff_from_tool(caller, reason, summary)
    except EXPECTED as error:
        raise tool_failure(error) from error
    return "Handed off: a ticket is open for the team, and you won't answer this customer again until they resolve it. Tell the customer the team will follow up here."


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
