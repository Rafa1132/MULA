import asyncio
import json
import re
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from mcp.server.mcpserver.exceptions import ToolError

from src.features.agents import routes, service, tools
from src.features.auth import accounts
from src.features.operator.csv_files import CsvFile
from src.main import app
from tests.support.account_fixture import AccountFixture
from tests.support.database_fixture import DatabaseFixture
from tests.support.runtime_fixture import answer, gateway, stream_response

CSV = CsvFile(name="sales.csv", content="date,sales\n" + "\n".join(f"2026-01-{day:02d},{100 + day * 10}" for day in range(1, 31)))


def events(response):
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def ticket_in(request):
    """The ticket the backend put in a runtime request's system prompt."""
    system = json.loads(request.content)["messages"][0]["content"]
    return re.search(r"`ticket` on every Mula tool call: (\S+)", system).group(1)


class AgentFixture(AccountFixture):
    def set_delegation(self, mode):
        saved = self.client.put("/api/team/operator", json={"prompt": "", "data": "", "tools": ["csv_read", "memory_read", "memory_write"], "revision": 0, "brain": "qwen", "delegation": mode})
        self.assertEqual(saved.status_code, 200, saved.text)

    def operator_ticket(self, attachment=None, message_id=None):
        return service.issue_ticket(self.account["id"], "operator", attachment, message_id=message_id)


class TicketTests(AgentFixture, unittest.TestCase):
    def test_tickets_are_scoped_to_agent_and_expire(self):
        operator = self.operator_ticket()
        forecasting = service.issue_ticket(self.account["id"], "forecasting", CSV)
        self.assertEqual(service.resolve_ticket(forecasting, "calculate_forecast")["attachment"], CSV)
        for token, tool in [(operator, "calculate_forecast"), (forecasting, "ask_agent"), ("made-up", "latest_forecast"), ("", "latest_forecast")]:
            with self.subTest(tool=tool), self.assertRaises(service.ToolDenied):
                service.resolve_ticket(token, tool)
        with patch.object(service, "TICKET_SECONDS", 0):
            expired = service.issue_ticket(self.account["id"], "forecasting", CSV)
        with self.assertRaises(service.ToolDenied):
            service.resolve_ticket(expired, "calculate_forecast")
        # Only the hash is stored.
        with accounts.database() as db:
            self.assertEqual(db.execute("SELECT count(*) AS stored FROM agent_tickets WHERE token_hash = %s", (forecasting,)).fetchone()["stored"], 0)


class ForecastToolTests(AgentFixture, unittest.TestCase):
    def test_calculate_forecast_saves_the_run_for_the_tickets_account(self):
        ticket = service.issue_ticket(self.account["id"], "forecasting", CSV)
        result = json.loads(tools.calculate_forecast(ticket, "date", "sales", horizon=3, method="drift"))
        self.assertEqual(result["method"], "drift")
        self.assertEqual([point["value"] for point in result["forecast"]], [410, 420, 430])
        self.assertEqual(result["history_periods"], 30)
        self.assertEqual(self.client.get("/api/forecasting/latest").json()["report"]["id"], result["id"])
        self.assertEqual(json.loads(tools.latest_forecast(ticket))["id"], result["id"])

    def test_forecast_tool_failures_are_readable(self):
        no_csv = service.issue_ticket(self.account["id"], "forecasting")
        with self.assertRaisesRegex(ToolError, "No CSV is attached"):
            tools.calculate_forecast(no_csv, "date", "sales")
        self.assertEqual(tools.latest_forecast(no_csv), "The owner has no saved forecasts yet.")
        ticket = service.issue_ticket(self.account["id"], "forecasting", CSV)
        with self.assertRaisesRegex(ToolError, "Choose columns from the uploaded CSV"):
            tools.calculate_forecast(ticket, "day", "sales")
        self.client.put("/api/team/forecasting", json={"prompt": "", "data": "", "tools": ["naive"], "revision": 0, "brain": "qwen"})
        with self.assertRaisesRegex(ToolError, "disabled"):
            tools.calculate_forecast(ticket, "date", "sales", method="drift")
        with self.assertRaisesRegex(ToolError, "cannot use calculate_forecast"):
            tools.calculate_forecast(self.operator_ticket(CSV), "date", "sales")


class DelegationTests(AgentFixture, unittest.TestCase):
    def test_ask_first_queues_a_request_without_running_another_agent(self):
        message_id = accounts.add_message(self.account["id"], "assistant", "", None)
        ticket = self.operator_ticket(CSV, message_id)
        with gateway(lambda request: self.fail("No agent may run before approval")):
            reply = tools.ask_agent(ticket, "forecasting", "Forecast next week")
        self.assertIn("the answer comes once they approve", reply)
        [request] = self.client.get("/api/conversation").json()["requests"]
        self.assertEqual((request["status"], request["to_name"], request["message_id"]), ("pending", "Forecasting", message_id))
        self.assertFalse(request["approved_in_advance"])
        self.assertNotIn("attachment", request)

    def test_go_ahead_is_approved_in_advance_but_never_runs_inside_the_tool_call(self):
        # The runtime serves one tool call at a time, so an agent answering inside
        # ask_agent could never use its own tools. The answer runs after the reply.
        self.set_delegation("auto")
        ticket = self.operator_ticket(CSV)
        with gateway(lambda request: self.fail("No agent may run inside the tool call")):
            reply = tools.ask_agent(ticket, "forecasting", "Forecast next week")
        self.assertIn("answer will appear in this chat right after your reply", reply)
        [request] = service.requests_for_ticket(ticket)
        self.assertEqual((request["status"], request["approved_in_advance"]), ("pending", True))

    def test_off_and_wrong_callers_are_refused(self):
        self.set_delegation("off")
        with self.assertRaisesRegex(ToolError, "turned off"):
            tools.ask_agent(self.operator_ticket(), "forecasting", "Forecast")
        forecasting = service.issue_ticket(self.account["id"], "forecasting")
        with self.assertRaisesRegex(ToolError, "cannot use ask_agent"):
            tools.ask_agent(forecasting, "forecasting", "Forecast")
        nested = service.issue_ticket(self.account["id"], "operator", depth=1)
        with self.assertRaisesRegex(ToolError, "cannot ask"):
            tools.ask_agent(nested, "forecasting", "Forecast")

    def test_operator_reply_reports_requests_made_during_the_turn(self):
        def handler(request):
            # Stand-in for the runtime calling ask_agent ("ask first") in the middle of the turn.
            ticket = ticket_in(request)
            service.ask_agent(ticket, "forecasting", "Forecast next week")
            return stream_response(answer("I asked Forecasting."))
        with gateway(handler):
            response = self.client.post("/api/agents/operator/chat", json={"message": "Forecast my sales", "stream": True, "csv_file": CSV.model_dump()})
        stream = events(response)
        kinds = [item["type"] for item in stream]
        self.assertLess(kinds.index("request"), kinds.index("done"))
        request = next(item["request"] for item in stream if item["type"] == "request")
        conversation = self.client.get("/api/conversation").json()
        self.assertEqual(request["message_id"], conversation["messages"][-1]["id"])
        self.assertEqual(conversation["requests"][0]["status"], "pending")


class ApprovalTests(AgentFixture, unittest.TestCase):
    def pending(self):
        message_id = accounts.add_message(self.account["id"], "assistant", "Shall I ask Forecasting?", None)
        service.ask_agent(self.operator_ticket(CSV, message_id), "forecasting", "Forecast next week")
        return self.client.get("/api/conversation").json()["requests"][0]["id"]

    def test_approval_runs_forecasting_then_the_operator_relays(self):
        request_id = self.pending()
        captured = []

        def handler(request):
            captured.append(request)
            if request.headers["X-Hermes-Session-Id"].startswith("mula-forecasting-"):
                return stream_response(answer("About 450 per day."))
            return stream_response(answer("Forecasting expects about 450 per day."))
        with gateway(handler):
            response = self.client.post(f"/api/agents/requests/{request_id}/approve")
        self.assertEqual(response.status_code, 200, response.text)
        statuses = [item["request"]["status"] for item in events(response) if item["type"] == "request"]
        self.assertEqual(statuses, ["running", "answered"])
        # Forecasting answers as itself, in its own session, with the CSV passed on in a new ticket.
        forecasting = json.loads(captured[0].content)
        self.assertTrue(forecasting["messages"][0]["content"].startswith(service.PERSONAS["forecasting"]))
        self.assertIn('"columns": ["date", "sales"]', forecasting["messages"][1]["content"])
        self.assertTrue(captured[0].headers["X-Hermes-Session-Id"].startswith("mula-forecasting-"))
        self.assertEqual(service.resolve_ticket(ticket_in(captured[0]), "calculate_forecast")["attachment"], CSV)
        relay = json.loads(captured[1].content)["messages"][1]["content"]
        self.assertIn("About 450 per day.", relay)
        self.assertEqual(captured[1].headers["X-Hermes-Session-Id"], f"mula-operator-{self.account['conversation_id']}")
        conversation = self.client.get("/api/conversation").json()
        self.assertEqual(conversation["messages"][-1]["text"], "Forecasting expects about 450 per day.")
        self.assertEqual(conversation["messages"][-1]["note"], "Answer from Forecasting")
        self.assertEqual(conversation["requests"][0]["status"], "answered")
        self.assertEqual(self.client.post(f"/api/agents/requests/{request_id}/approve").status_code, 409)
        self.assertEqual(self.client.post(f"/api/agents/requests/{request_id}/decline").json()["request"]["status"], "answered")

    def test_failed_answer_marks_the_request(self):
        request_id = self.pending()
        with gateway(lambda request: stream_response("data: [DONE]\n\n")):
            stream = events(self.client.post(f"/api/agents/requests/{request_id}/approve"))
        self.assertEqual(stream[-1]["type"], "error")
        self.assertEqual(self.client.get("/api/conversation").json()["requests"][0]["status"], "failed")

    def test_stopped_approval_does_not_leave_the_request_running(self):
        request = service.start_request(self.account["id"], self.pending())
        stream = routes.approved_events(self.account, request)

        async def stop_after_first_event():
            await anext(stream)
            await stream.aclose()
        asyncio.run(stop_after_first_event())
        self.assertEqual(self.client.get("/api/conversation").json()["requests"][0]["status"], "failed")

    def test_decline_expiry_and_other_accounts(self):
        declined = self.pending()
        self.assertEqual(self.client.post(f"/api/agents/requests/{declined}/decline").json()["request"]["status"], "declined")
        self.assertEqual(self.client.post(f"/api/agents/requests/{declined}/approve").status_code, 409)
        stale = self.pending()
        with patch.object(service, "REQUEST_SECONDS", -1):
            self.assertEqual(self.client.get("/api/conversation").json()["requests"][1]["status"], "expired")
            self.assertEqual(self.client.post(f"/api/agents/requests/{stale}/approve").status_code, 409)
        other = self.pending()
        self.client.post("/api/auth/signup", json={"username": "other", "password": "long-password-123"})
        self.assertEqual(self.client.post(f"/api/agents/requests/{other}/approve").status_code, 404)
        self.assertEqual(self.client.post(f"/api/agents/requests/{other}/decline").status_code, 404)
        self.assertEqual(self.client.get("/api/conversation").json()["requests"], [])


class DirectChatTests(AgentFixture, unittest.TestCase):
    def test_forecasting_chat_has_its_own_history_and_session(self):
        captured = []

        def handler(request):
            captured.append(request)
            return stream_response(answer("Send me your sales CSV."))
        with gateway(handler):
            response = self.client.post("/api/agents/forecasting/chat", json={"message": "Can you forecast?", "csv_file": CSV.model_dump()})
            self.client.post("/api/agents/forecasting/chat", json={"message": "Again"})
        self.assertEqual([item["type"] for item in events(response)], ["attachment", "token", "done"])
        sessions = {request.headers["X-Hermes-Session-Id"] for request in captured}
        self.assertEqual(len(sessions), 1)
        self.assertTrue(sessions.pop().startswith("mula-forecasting-"))
        self.assertIn('"columns": ["date", "sales"]', json.loads(captured[0].content)["messages"][1]["content"])
        history = self.client.get("/api/agents/forecasting/conversation").json()["messages"]
        self.assertEqual([message["role"] for message in history], ["user", "assistant", "user", "assistant"])
        self.assertEqual(history[1]["text"], "Send me your sales CSV.")
        self.assertEqual(self.client.get("/api/conversation").json()["messages"], [])

    def test_operator_and_unknown_agents_have_no_direct_chat(self):
        self.assertEqual(self.client.post("/api/agents/inventory/chat", json={"message": "Hi"}).status_code, 404)
        self.assertEqual(self.client.get("/api/agents/operator/conversation").status_code, 404)

    def test_messages_from_before_agent_histories_stay_with_the_operator(self):
        # A message written without an agent (as the old database did) belongs to the Operator.
        with accounts.database() as db:
            db.execute("INSERT INTO messages (account_id, role, text) VALUES (%s, 'user', 'Old question')", (self.account["id"],))
        self.assertEqual(self.client.get("/api/conversation").json()["messages"][0]["text"], "Old question")
        self.assertEqual(self.client.get("/api/agents/forecasting/conversation").json()["messages"], [])


class ToolServerTests(DatabaseFixture, unittest.TestCase):
    # Entering TestClient runs the app's startup, which migrates the database, so this needs a schema.
    INITIALIZE = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}}}
    HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}

    def post(self, key, authorization):
        with patch("src.common.config.MULA_TOOLS_KEY", key), TestClient(app, base_url="http://127.0.0.1:8000") as client:
            headers = dict(self.HEADERS)
            if authorization:
                headers["Authorization"] = authorization
            return client.post("/mcp/", json=self.INITIALIZE, headers=headers)

    def test_tool_server_requires_the_shared_key(self):
        self.assertEqual(self.post("", "Bearer ").status_code, 401)
        self.assertEqual(self.post("right-key", None).status_code, 401)
        self.assertEqual(self.post("right-key", "Bearer wrong-key").status_code, 401)
        response = self.post("right-key", "Bearer right-key")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["result"]["serverInfo"]["name"], "mula")


if __name__ == "__main__":
    unittest.main()
