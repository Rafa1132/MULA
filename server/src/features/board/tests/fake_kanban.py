"""An in-memory stand-in for `hermes kanban`, answering the commands the Board uses the way the real
command line does (checked by test_kanban_cli.py). Every call is recorded in `calls`."""

import itertools
import json

from src.features.board import runtime


class FakeKanban:
    def __init__(self):
        self.boards: dict[str, dict[str, dict]] = {}
        self.calls: list[tuple[list[str], str | None]] = []
        self.ids = itertools.count(0xA0000001)

    async def run(self, args, stdin=None):
        self.calls.append((list(args), stdin))
        if args[:3] == ["boards", "list", "--json"]:
            return json.dumps([{"slug": slug} for slug in self.boards])
        if args[:2] == ["boards", "create"]:
            self.boards.setdefault(args[2], {})
            return "Created board"
        assert args[0] == "--board", args
        tasks = self.boards[args[1]]
        command, rest = args[2], args[3:]
        handler = getattr(self, "do_" + command.replace("-", "_"))
        return handler(tasks, rest, stdin)

    def task(self, tasks, card_id):
        if card_id not in tasks:
            raise runtime.KanbanError(missing=True)
        return tasks[card_id]

    @staticmethod
    def option(rest, name):
        if name in rest:
            return rest[rest.index(name) + 1]
        return None

    def do_create(self, tasks, rest, stdin):
        title = rest[rest.index("--") + 1]
        card_id = f"t_{next(self.ids):08x}"
        status = "ready"
        if self.option(rest, "--initial-status") == "blocked":
            status = "blocked"
        tasks[card_id] = {"id": card_id, "title": title, "body": stdin or "", "status": status,
                          "assignee": self.option(rest, "--assignee"), "created_by": self.option(rest, "--created-by"),
                          "created_at": 1_800_000_000 + len(tasks), "started_at": None, "completed_at": None,
                          "result": None, "last_failure_error": None, "model_override": None, "provider_override": None,
                          "comments": []}
        return json.dumps(self.public(tasks[card_id]))

    @staticmethod
    def public(task):
        return {key: value for key, value in task.items() if key != "comments"}

    def do_list(self, tasks, rest, stdin):
        return json.dumps([self.public(task) for task in tasks.values() if task["status"] != "archived"])

    def do_show(self, tasks, rest, stdin):
        task = self.task(tasks, rest[0])
        return json.dumps({"task": self.public(task), "comments": task["comments"], "runs": [], "events": [],
                           "parents": [], "children": [], "latest_summary": None})

    def do_comment(self, tasks, rest, stdin):
        task = self.task(tasks, rest[0])
        task["comments"].append({"author": self.option(rest, "--author"), "body": rest[rest.index("--") + 1], "created_at": 1})
        return "Comment added"

    def do_set_model(self, tasks, rest, stdin):
        task = self.task(tasks, rest[0])
        if rest[1] == "none":
            task["model_override"] = task["provider_override"] = None
        else:
            task["model_override"], task["provider_override"] = rest[1], self.option(rest, "--provider")
        return "Set model"

    def do_unblock(self, tasks, rest, stdin):
        self.task(tasks, rest[0])["status"] = "ready"
        return "Unblocked"

    def do_block(self, tasks, rest, stdin):
        task = self.task(tasks, rest[0])
        task["status"] = "blocked"
        return "Blocked"

    def do_complete(self, tasks, rest, stdin):
        task = self.task(tasks, rest[0])
        task["status"], task["result"] = "done", self.option(rest, "--summary")
        return "Completed"

    def do_archive(self, tasks, rest, stdin):
        self.task(tasks, rest[0])["status"] = "archived"
        return "Archived"

    def do_edit(self, tasks, rest, stdin):
        task = self.task(tasks, rest[0])
        for item in rest[1:]:
            if item.startswith("--title="):
                task["title"] = item.removeprefix("--title=")
            if item.startswith("--body="):
                task["body"] = item.removeprefix("--body=")
        return "Edited"

    def do_assign(self, tasks, rest, stdin):
        task = self.task(tasks, rest[0])
        task["assignee"] = None
        if rest[1] != "none":
            task["assignee"] = rest[1]
        return "Assigned"

    def commands(self):
        """The board commands run so far, without the `--board <slug>` prefix."""
        return [args[2:] for args, _ in self.calls if args[0] == "--board"]
