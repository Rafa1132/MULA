import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.main import app  # first: the app import settles the features' import order
from src.common import profiles
from src.features.agents import service as agents
from src.features.agents import tools
from src.features.board import runtime, service
from src.features.operator.runtime import HermesError
from tests.support.account_fixture import AccountFixture

from .fake_kanban import FakeKanban


class BoardFixture(AccountFixture):
    """The account fixture with the runtime's kanban replaced by FakeKanban, and Start's runtime
    checks (brain set up, profile served) stubbed, so no test reaches a runtime or a model."""

    def setUp(self):
        super().setUp()
        self.kanban = FakeKanban()
        for target, value in (("src.features.board.runtime.run", self.kanban.run),
                              ("src.features.board.runtime._known_boards", set())):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.require_model = AsyncMock()
        self.serve_profile = unittest.mock.Mock()
        for target, value in (("src.features.board.service.operator_runtime.require_model", self.require_model),
                              ("src.features.board.service.operator_runtime.account_base_url", self.serve_profile)):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def card_creation(self):
        """The arguments and standard input of the first card `create` (not the board's)."""
        return next((args, stdin) for args, stdin in self.kanban.calls if args[0] == "--board" and args[2] == "create")

    def add(self, title="Restock rice", agent="operator", notes="Five sacks"):
        response = self.client.post("/api/board/cards", json={"title": title, "notes": notes, "agent": agent})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()


class BoardTests(BoardFixture, unittest.TestCase):
    def test_requires_a_project(self):
        self.assertEqual(TestClient(app).get("/api/board").status_code, 401)
        client = TestClient(app, cookies=self.client.cookies)
        self.assertEqual(client.get("/api/board").status_code, 400)

    def test_new_cards_are_parked_and_never_run_on_their_own(self):
        card = self.add()
        self.assertEqual(card["column"], "todo")
        self.assertEqual(card["agent"], "operator")
        self.assertEqual(card["agent_name"], "Operator")
        create, stdin = self.card_creation()
        self.assertIn("--initial-status", create)
        self.assertEqual(create[create.index("--initial-status") + 1], "blocked")
        self.assertEqual(create[create.index("--assignee") + 1], profiles.profile_name(self.project["id"], "operator"))
        self.assertEqual(stdin, "Five sacks")
        self.assertEqual(create[-2:], ["--", "Restock rice"])
        # The project's own board, made on first use and never switched to.
        self.assertIn(["boards", "create", runtime.board_slug(self.project["id"]), "--name", "Test business"],
                      [args for args, _ in self.kanban.calls])
        self.assertFalse(any("--switch" in args for args, _ in self.kanban.calls))
        board = self.client.get("/api/board").json()
        self.assertEqual([c["column"] for c in board["cards"]], ["todo"])
        self.assertEqual(board["columns"], ["todo", "working", "needs_you", "done"])
        self.assertEqual([a["id"] for a in board["agents"]], ["operator", "forecasting"])

    def test_titles_that_look_like_options_stay_titles(self):
        card = self.add(title="--help me count stock", notes="")
        self.assertEqual(card["title"], "--help me count stock")

    def test_forecasting_cards_run_as_the_forecasting_profile(self):
        self.add(agent="forecasting")
        create, _ = self.card_creation()
        self.assertEqual(create[create.index("--assignee") + 1], profiles.profile_name(self.project["id"], "forecasting"))

    def test_another_project_never_sees_or_reaches_this_board(self):
        card = self.add()
        other = TestClient(app, cookies=self.client.cookies)
        self.open_new_project(other, "Second shop")
        self.assertEqual(other.get("/api/board").json()["cards"], [])
        self.assertEqual(other.get(f"/api/board/cards/{card['id']}").status_code, 404)
        self.assertEqual(other.post(f"/api/board/cards/{card['id']}/start").status_code, 404)
        stranger = TestClient(app)
        self.switch_to_new_account("stranger", stranger)
        stranger.headers["X-Mula-Project"] = self.project["id"]
        self.assertEqual(stranger.get("/api/board").status_code, 404)

    def test_invalid_card_ids_never_reach_the_runtime(self):
        before = len(self.kanban.calls)
        for card_id in ["t_xyz", "x_ae9b8693", "t_ae9b8693;ls", "..%2Fetc"]:
            with self.subTest(card_id=card_id):
                self.assertIn(self.client.get(f"/api/board/cards/{card_id}").status_code, (404,))
        self.assertEqual(len(self.kanban.calls), before)

    def test_validation_never_echoes_card_text(self):
        for payload in [{}, {"title": "   "}, {"title": "a" * 201}, {"title": "x", "notes": "n" * 4001},
                        {"title": "x", "agent": "inventory"}, {"title": "x", "extra": 1}, {"title": 5}]:
            with self.subTest(payload=str(payload)[:40]):
                response = self.client.post("/api/board/cards", json=payload)
                self.assertEqual(response.status_code, 422)
                self.assertNotIn("nnnn", response.text)

    def test_start_without_an_agent_is_refused(self):
        card = self.add(agent=None)
        self.assertIsNone(card["agent"])
        response = self.client.post(f"/api/board/cards/{card['id']}/start")
        self.assertEqual(response.status_code, 409)
        self.assertNotIn(["unblock", card["id"]], self.kanban.commands())

    def test_start_runs_the_card_with_the_agents_local_brain(self):
        card = self.add()
        response = self.client.post(f"/api/board/cards/{card['id']}/start")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["column"], "working")
        commands = self.kanban.commands()
        # The brain is copied onto the card before it is released, never after.
        self.assertLess(commands.index(["set-model", card["id"], "none"]), commands.index(["unblock", card["id"]]))
        self.serve_profile.assert_called_once_with(self.project["id"], None, "operator", [])
        self.require_model.assert_awaited_once()

    def test_start_copies_a_cloud_brain_onto_the_card(self):
        card = self.add()
        settings = {"brain": "qwen-openrouter", "runtime_toolsets": ["web"]}
        with patch("src.features.board.service.team.settings", return_value=settings):
            self.assertEqual(self.client.post(f"/api/board/cards/{card['id']}/start").status_code, 200)
        self.assertIn(["set-model", card["id"], "qwen/qwen3.8-27b", "--provider", "openrouter"], self.kanban.commands())
        self.serve_profile.assert_called_once_with(self.project["id"], None, "operator", ["web"])

    def test_start_is_refused_when_the_brain_is_not_set_up(self):
        card = self.add()
        self.require_model.side_effect = HermesError("The brain chosen in My agents is not set up on the Mula runtime.", 409)
        response = self.client.post(f"/api/board/cards/{card['id']}/start")
        self.assertEqual(response.status_code, 409)
        self.assertIn("not set up", response.json()["detail"])
        self.assertNotIn(["unblock", card["id"]], self.kanban.commands())

    def test_a_working_card_cannot_be_started_finished_or_archived(self):
        card = self.add()
        self.client.post(f"/api/board/cards/{card['id']}/start")
        for action in ("start", "done", "archive"):
            with self.subTest(action=action):
                self.assertEqual(self.client.post(f"/api/board/cards/{card['id']}/{action}").status_code, 409)

    def test_send_back_undoes_a_start_that_has_not_been_picked_up(self):
        card = self.add()
        self.assertEqual(self.client.post(f"/api/board/cards/{card['id']}/back").status_code, 409)
        self.client.post(f"/api/board/cards/{card['id']}/start")
        response = self.client.post(f"/api/board/cards/{card['id']}/back")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["column"], "todo")

    def test_a_card_the_agent_blocked_needs_the_owner(self):
        card = self.add()
        task = self.kanban.boards[runtime.board_slug(self.project["id"])][card["id"]]
        task.update(status="blocked", started_at=1_800_000_100)
        task["comments"].append({"author": "default", "body": "BLOCKED: Which supplier?", "created_at": 2})
        details = self.client.get(f"/api/board/cards/{card['id']}").json()
        self.assertEqual(details["column"], "needs_you")
        self.assertEqual(details["comments"][-1]["author"], "Board")
        # Continue is Start again.
        self.assertEqual(self.client.post(f"/api/board/cards/{card['id']}/start").status_code, 200)

    def test_done_comments_edit_and_archive(self):
        card = self.add()
        response = self.client.post(f"/api/board/cards/{card['id']}/comments", json={"text": "-1 sack; $(not a shell)"})
        self.assertEqual(response.json()["comments"][-1], {"author": "owner", "body": "-1 sack; $(not a shell)", "created_at": 1})
        changed = self.client.patch(f"/api/board/cards/{card['id']}", json={"title": "Restock rice now", "agent": None}).json()
        self.assertEqual((changed["title"], changed["agent"]), ("Restock rice now", None))
        kept = self.client.patch(f"/api/board/cards/{card['id']}", json={"notes": "Ten sacks"}).json()
        self.assertEqual((kept["notes"], kept["agent"]), ("Ten sacks", None))
        done = self.client.post(f"/api/board/cards/{card['id']}/done").json()
        self.assertEqual(done["column"], "done")
        self.assertEqual(self.client.post(f"/api/board/cards/{card['id']}/archive").status_code, 204)
        self.assertEqual(self.client.get("/api/board").json()["cards"], [])
        self.assertEqual(self.client.get(f"/api/board/cards/{card['id']}").status_code, 404)


class BoardToolTests(BoardFixture, unittest.TestCase):
    def test_operator_adds_parked_cards_and_comments_from_chat(self):
        ticket = agents.issue_ticket(self.project["id"], "operator")
        reply = asyncio.run(tools.board_add_card(ticket, "Order packaging", "200 boxes", "forecasting"))
        self.assertIn("presses Start", reply)
        card = self.client.get("/api/board").json()["cards"][0]
        self.assertEqual((card["column"], card["agent"], card["created_by"]), ("todo", "forecasting", "Operator"))
        self.assertIn(card["id"], asyncio.run(tools.board_list(ticket)))
        asyncio.run(tools.board_comment(ticket, card["id"], "Supplier confirmed."))
        comments = self.client.get(f"/api/board/cards/{card['id']}").json()["comments"]
        self.assertEqual(comments[-1]["author"], "Operator")
        # No tool can release a card.
        self.assertNotIn("unblock", [command[0] for command in self.kanban.commands()])

    def test_forecasting_may_read_and_comment_but_not_add(self):
        ticket = agents.issue_ticket(self.project["id"], "forecasting")
        self.assertEqual(asyncio.run(tools.board_list(ticket)), "The Board has no cards yet.")
        with self.assertRaises(tools.ToolError):
            asyncio.run(tools.board_add_card(ticket, "Sneaky card"))

    def test_tools_refuse_unknown_tickets_and_bad_agents(self):
        with self.assertRaises(tools.ToolError):
            asyncio.run(tools.board_list("not-a-ticket"))
        ticket = agents.issue_ticket(self.project["id"], "operator")
        with self.assertRaises(tools.ToolError):
            asyncio.run(tools.board_add_card(ticket, "Card", "", "inventory"))


class ColumnTests(unittest.TestCase):
    def test_runtime_statuses_map_to_columns(self):
        cases = [({"status": "blocked", "started_at": None}, "todo"), ({"status": "blocked", "started_at": 5}, "needs_you"),
                 ({"status": "ready"}, "working"), ({"status": "running"}, "working"), ({"status": "review"}, "needs_you"),
                 ({"status": "done"}, "done"), ({"status": "archived"}, None), ({"status": "triage"}, "todo"),
                 ({"status": "todo"}, "todo"), ({"status": "scheduled"}, "todo")]
        for task, column in cases:
            with self.subTest(task=task):
                self.assertEqual(service.column_for(task), column)


if __name__ == "__main__":
    unittest.main()
