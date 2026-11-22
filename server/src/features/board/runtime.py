"""The only code that runs the Mula runtime's `hermes kanban` command line.

Every call names the project's own board (`--board mula-<project hex>`), so a card id from another
project's board is simply "not found". The command runs without a shell: card text is passed as
its own argument after `--` or on standard input, never interpreted. Errors never include card
text; the runtime's message is logged at debug level only.
"""

import asyncio
import json
import logging
import os
from pathlib import Path
import re
from uuid import UUID

from fastapi import HTTPException

from ...common import config, profiles
from ...common.paths import PROJECT_ROOT

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 20
# The runtime's task ids, for example t_ae9b8693. Checked before any call.
CARD_ID = re.compile(r"t_[0-9a-f]{8,32}")


def hermes_bin() -> Path:
    if config.MULA_HERMES_BIN:
        return Path(config.MULA_HERMES_BIN)
    return PROJECT_ROOT / ".runtime" / "hermes-source" / ".hermes" / "bin" / "hermes"


def board_slug(project_id: str) -> str:
    """`mula-<32 hex>`: within the runtime's slug rule ([a-z0-9][a-z0-9_-]{0,63})."""
    return "mula-" + UUID(project_id).hex


def require_card_id(card_id: str) -> str:
    if not isinstance(card_id, str) or not CARD_ID.fullmatch(card_id):
        raise HTTPException(404, "That card isn't on this board.")
    return card_id


class KanbanError(Exception):
    """The command failed; `missing` when the runtime said the card doesn't exist."""

    def __init__(self, missing: bool = False):
        super().__init__("kanban command failed")
        self.missing = missing


async def run(args: list[str], stdin: str | None = None) -> str:
    """Run `hermes kanban <args>` and return its standard output. Raises HTTPException when the
    runtime can't be run at all, and KanbanError when the command itself fails."""
    binary = hermes_bin()
    if not binary.is_file():
        raise HTTPException(503, "The Board needs the Mula runtime installed on this server. Chat still works.")
    environment = dict(os.environ)
    environment["HERMES_HOME"] = str(profiles.RUNTIME_HOME)
    # The board is always named on the command line; never let a stray setting pick another.
    environment.pop("HERMES_KANBAN_BOARD", None)
    environment.pop("HERMES_KANBAN_DB", None)
    # Never inherit the backend's own standard input: a command that reads it would wait forever.
    stdin_pipe = asyncio.subprocess.DEVNULL
    if stdin is not None:
        stdin_pipe = asyncio.subprocess.PIPE
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            str(binary), "kanban", *args,
            stdin=stdin_pipe, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=environment,
        )
        input_bytes = None
        if stdin is not None:
            input_bytes = stdin.encode("utf-8")
        stdout, stderr = await asyncio.wait_for(process.communicate(input_bytes), timeout=TIMEOUT_SECONDS)
    except TimeoutError as error:
        raise HTTPException(504, "The Board took too long to answer. Try again.") from error
    except OSError as error:
        raise HTTPException(503, "The Mula runtime couldn't be started for the Board. Chat still works.") from error
    finally:
        # Also runs on cancellation; never leave a command running behind a finished request.
        if process is not None and process.returncode is None:
            process.kill()
            await process.wait()
    if process.returncode != 0:
        message = stderr.decode("utf-8", "replace") + stdout.decode("utf-8", "replace")
        logger.debug("hermes kanban %s failed with %s", args[:3], process.returncode)
        raise KanbanError(missing="no such task" in message)
    return stdout.decode("utf-8", "replace")


async def run_json(args: list[str], stdin: str | None = None):
    output = await run(args, stdin)
    try:
        return json.loads(output)
    except ValueError as error:
        raise HTTPException(502, "The Board's runtime gave an unreadable answer.") from error


async def on_board(project_id: str, args: list[str], stdin: str | None = None, as_json: bool = False):
    """Run a command on the project's board."""
    full = ["--board", board_slug(project_id), *args]
    if as_json:
        return await run_json(full, stdin)
    return await run(full, stdin)


# Boards known to exist, so a page load doesn't spend a runtime call checking every time.
_known_boards: set[str] = set()


async def board_exists(slug: str) -> bool:
    boards = await run_json(["boards", "list", "--json"])
    if not isinstance(boards, list):
        raise HTTPException(502, "The Board's runtime gave an unreadable answer.")
    return any(isinstance(board, dict) and board.get("slug") == slug for board in boards)


async def ensure_board(project_id: str, project_name: str) -> None:
    """Create the project's board once. Never switches the runtime's current board."""
    slug = board_slug(project_id)
    if slug in _known_boards:
        return
    if not await board_exists(slug):
        name = project_name.strip()[:80]
        if not name:
            name = "Mula project"
        try:
            await run(["boards", "create", slug, "--name", name])
        except KanbanError as error:
            # Two first visits at once: the other one may have created it.
            if not await board_exists(slug):
                raise HTTPException(503, "The project's board couldn't be created.") from error
    _known_boards.add(slug)
