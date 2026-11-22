# Board (the runtime's kanban)

Each project has a Board, a kanban of cards for its agents, stored by the Mula runtime (`hermes kanban`)
in a board named `mula-<project id hex>`. `runtime.py` is the only code that runs the command line; it
always names that board, never uses a shell, and passes card text after `--` or on standard input.

## The rule: nothing runs without a Start

- Every card is created `blocked` (`--initial-status blocked`). The runtime promotes and dispatches any
  other card on its own, even a `todo` one, the next time the board is listed; a blocked card stays put.
- **Start** (and **Continue** on a card that needs the owner) copies the agent's brain from My agents onto
  the card (`set-model`, or `none` for the local brain), checks the brain is set up and the agent's
  runtime profile is served, then `unblock`s it. The gateway's dispatcher picks it up within about 15 s.
- `kanban.auto_decompose` and `kanban.review_dispatch` are off in `server/hermes/config.yaml`; both would
  otherwise start model work with no click. At most 2 cards work at once, 1 per agent.
- Existing installs: `server/.venv/bin/python server/scripts/enable_kanban.py --apply`, then restart the runtime.

## Columns

| Runtime status | Column |
|---|---|
| `blocked`, never started | To do |
| `ready` (Started, not picked up: shown as "Starting"), `running` | Working |
| `blocked` after a run (the agent asked something), `review` | Needs you |
| `done` | Done |
| `archived` | hidden |

## API (`routes.py`, every route scoped to the `X-Mula-Project` project)

`GET /api/board`, `POST /api/board/cards`, `GET`/`PATCH /api/board/cards/{id}`, and `POST` on
`…/{id}/start`, `/back` (undo a Start not yet picked up), `/done`, `/comments`, `/archive`.

## From chat

Mula's own MCP tools in `features/agents/tools.py`, not the runtime's `kanban_*` tools (those could name
any board and create cards that run at once): `board_list` and `board_comment` for both agents, and
`board_add_card` for the Operator. Cards added from chat are parked like any other; no tool starts,
finishes or archives a card.

## Limits

A card's worker runs as the agent's runtime profile with only the runtime's kanban tools for that card:
it can reason, comment, finish or ask (block). It has no Mula tools, terminal or files, and it doesn't
get the agent's custom instructions from My agents.

## Tests

`tests/test_board.py` (API and tools against `tests/fake_kanban.py`) and `tests/test_kanban_cli.py`
(real processes: an echo stand-in, and the real command line with a throwaway `HERMES_KANBAN_HOME` when
the runtime is installed; no gateway runs and no model is called).
