"""Writes that SQLite's database-wide lock used to serialise must stay exactly-once on PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
import unittest

from fastapi import HTTPException

from src.features.auth import accounts
from src.features.agents import service as agents
from src.features.team import service as team
from tests.support.account_fixture import AccountFixture


def outcome(call):
    try:
        return call()
    except HTTPException as error:
        return error.status_code


class ConcurrencyTests(AccountFixture, unittest.TestCase):
    def test_same_revision_saved_twice_at_once_wins_once(self):
        value = team.SettingsInput(prompt="", data="", tools=["csv_read"], revision=0, brain="qwen", delegation="ask")
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: outcome(lambda: team.save(self.account["id"], "operator", value)), range(4)))
        conflicts = [result for result in results if result == 409]
        saved = [result for result in results if isinstance(result, dict)]
        self.assertEqual((len(saved), len(conflicts)), (1, 3))
        self.assertEqual(team.settings(self.account["id"], "operator")["revision"], 1)

    def test_pending_request_is_claimed_by_exactly_one_approver(self):
        ticket = agents.issue_ticket(self.account["id"], "operator")
        caller = agents.resolve_ticket(ticket, "ask_agent")
        request_id = agents.create_request(caller, ticket, "forecasting", "How many?", approved_in_advance=False)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: agents.start_request(self.account["id"], request_id), range(4)))
        self.assertEqual(sum(1 for result in results if result["claimed"]), 1)
        self.assertTrue(all(result["status"] == "running" for result in results))

    def test_parallel_messages_get_distinct_increasing_ids(self):
        with ThreadPoolExecutor(max_workers=6) as pool:
            ids = list(pool.map(lambda index: accounts.add_message(self.account["id"], "user", f"m{index}"), range(12)))
        self.assertEqual(len(set(ids)), 12)
        self.assertEqual([message["id"] for message in accounts.history(self.account["id"])], sorted(ids))
