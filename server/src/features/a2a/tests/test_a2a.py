"""A2A between Mula agents: cards, the stored Message and Task, links, and both directions."""
import json
import unittest

# First: it imports the agents' routes, which load the modules below in the order the app does.
from src.features.agents.tests.test_agents import CSV, AgentFixture, events, ticket_in
from src.features.a2a import tasks as a2a_tasks
from src.features.a2a.cards import card_for
from src.features.a2a.schema import PROTOCOL_VERSION, Message
from src.features.agents import service, tools
from src.features.auth import accounts
from tests.support.runtime_fixture import answer, gateway, stream_response


class CardTests(AgentFixture, unittest.TestCase):
    def test_cards_come_from_the_agent_files(self):
        card = card_for("forecasting").wire()
        self.assertEqual((card["protocolVersion"], card["name"], card["url"]), (PROTOCOL_VERSION, "Forecasting", "mula://agents/forecasting"))
        self.assertEqual(card["capabilities"], {"streaming": False, "pushNotifications": False})
        self.assertIn("text/csv", card["defaultInputModes"])
        self.assertEqual([skill["id"] for skill in card["skills"]][:2], ["forecasting", "naive"])
        # The persona and the Mula tool list never appear on a card.
        self.assertNotIn("You are", json.dumps(card))
        self.assertNotIn("calculate_forecast", json.dumps(card))

    def test_card_route_is_signed_in_and_knows_its_agents(self):
        self.assertEqual(self.client.get("/api/team/operator/card").json()["name"], "Operator")
        self.assertEqual(self.client.get("/api/team/inventory/card").status_code, 404)
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.get("/api/team/operator/card").status_code, 401)


class MessageTests(unittest.TestCase):
    def test_wire_names_follow_the_specification_and_unknown_fields_are_refused(self):
        message = a2a_tasks.request_message("r1", "c1", "operator", "forecasting", "Forecast next week", "sales.csv")
        wire = message.wire()
        self.assertEqual((wire["kind"], wire["role"], wire["messageId"], wire["contextId"], wire["taskId"]), ("message", "user", "r1:question", "c1", "r1"))
        self.assertEqual(wire["parts"][1], {"kind": "data", "data": {"attachment": {"type": "text/csv", "name": "sales.csv"}}})
        self.assertEqual(Message.model_validate(wire), message)
        with self.assertRaises(ValueError):
            Message.model_validate({**wire, "unexpected": True})
        with self.assertRaises(ValueError):
            Message.model_validate({**wire, "parts": []})

    def test_states_map_from_the_stored_status(self):
        self.assertEqual(a2a_tasks.state_for("pending", False), "auth-required")
        self.assertEqual(a2a_tasks.state_for("pending", True), "submitted")
        expected = {"running": "working", "answered": "completed", "declined": "rejected", "failed": "failed", "expired": "canceled"}
        for status, state in expected.items():
            with self.subTest(status=status):
                self.assertEqual(a2a_tasks.state_for(status, False), state)

    def test_rows_saved_before_a2a_read_as_tasks_too(self):
        row = {"id": "r1", "project_id": "6f1c4a52-8a5b-4c8e-9d84-1b2f3c4d5e6f", "from_agent": "operator", "to_agent": "forecasting",
               "question": "Forecast", "answer": "About 450.", "approved_in_advance": False, "created": 0,
               "context_id": None, "message": None, "artifacts": None}
        task = a2a_tasks.task_from_row(row, "answered").wire()
        self.assertEqual(task["status"]["state"], "completed")
        self.assertEqual(task["history"][0]["parts"], [{"kind": "text", "text": "Forecast"}])
        self.assertEqual(task["artifacts"][0]["parts"], [{"kind": "text", "text": "About 450."}])


class TaskTests(AgentFixture, unittest.TestCase):
    def ask(self, attachment=CSV):
        message_id = accounts.add_message(self.project["id"], "assistant", "", None)
        tools.ask_agent(self.operator_ticket(attachment, message_id), "forecasting", "Forecast next week")
        return self.client.get("/api/conversation").json()["requests"][0]

    def test_a_request_is_stored_as_an_a2a_message_and_task(self):
        request = self.ask()
        self.assertEqual(request["state"], "auth-required")
        [task] = self.client.get("/api/team/tasks").json()["tasks"]
        self.assertEqual((task["kind"], task["id"], task["status"]["state"]), ("task", request["id"], "auth-required"))
        self.assertEqual(task["metadata"], {"from_agent": "operator", "to_agent": "forecasting"})
        question = task["history"][0]
        self.assertEqual(question["parts"][0], {"kind": "text", "text": "Forecast next week"})
        self.assertEqual(question["parts"][1]["data"]["attachment"]["name"], "sales.csv")
        # The CSV itself stays in the request; the message only names it.
        self.assertNotIn("2026-01-01", json.dumps(task))
        self.assertEqual(task["contextId"], a2a_tasks.context_id(self.project["id"], "operator", "forecasting"))
        self.assertEqual(self.client.get("/api/team/tasks?agent=forecasting").json()["tasks"][0]["id"], request["id"])
        self.assertEqual(self.client.get("/api/team/tasks?agent=inventory").status_code, 404)

    def test_the_answer_and_its_forecast_become_the_tasks_artifacts(self):
        request = self.ask()

        def handler(runtime_request):
            if runtime_request.headers["X-Hermes-Session-Id"].startswith("mula-forecasting-"):
                # Stand-in for Forecasting calling its tool during the answer.
                tools.calculate_forecast(ticket_in(runtime_request), "date", "sales", horizon=3, method="drift")
                return stream_response(answer("About 410, 420 and 430."))
            return stream_response(answer("Forecasting expects about 420."))
        with gateway(handler):
            stream = events(self.client.post(f"/api/agents/requests/{request['id']}/approve"))
        states = [item["request"]["state"] for item in stream if item["type"] == "request"]
        self.assertEqual(states, ["working", "completed"])
        [task] = self.client.get("/api/team/tasks").json()["tasks"]
        self.assertEqual(task["status"]["state"], "completed")
        text, data = task["artifacts"][0]["parts"]
        self.assertEqual(text, {"kind": "text", "text": "About 410, 420 and 430."})
        self.assertEqual([point["value"] for point in data["data"]["forecast"]["forecast"]], [410, 420, 430])

    def test_a_declined_request_is_rejected(self):
        request = self.ask()
        declined = self.client.post(f"/api/agents/requests/{request['id']}/decline").json()["request"]
        self.assertEqual(declined["state"], "rejected")
        self.assertEqual(self.client.get("/api/team/tasks").json()["tasks"][0]["status"]["state"], "rejected")


class LinkPromptTests(AgentFixture, unittest.TestCase):
    def prompt(self, agent_id):
        return service.system_prompt(agent_id, service.team.settings(self.project["id"], agent_id), "ticket")

    def test_the_prompt_lists_only_connected_agents(self):
        self.assertIn('Use ask_agent with agent "forecasting"', self.prompt("operator"))
        self.assertIn("The owner approves each request to Forecasting", self.prompt("operator"))
        self.assertIn("Do not call ask_agent", self.prompt("forecasting"))
        self.set_link("forecasting", "operator", "auto")
        forecasting = self.prompt("forecasting")
        self.assertIn('Use ask_agent with agent "operator"', forecasting)
        self.assertNotIn("The owner approves each request to Operator", forecasting)
        self.set_delegation("off")
        self.assertIn("Do not call ask_agent", self.prompt("operator"))

    def test_a_client_turn_cannot_ask_other_agents(self):
        config = service.team.settings(self.project["id"], "operator")
        prompt = service.system_prompt("operator", config, "ticket", via_client=True)
        self.assertIn(service.CLIENT_LINE, prompt)
        self.assertNotIn('Use ask_agent with agent "forecasting"', prompt)


class ReverseLinkTests(AgentFixture, unittest.TestCase):
    """Forecasting asks the Operator from its own chat once the owner connects them."""

    def test_forecasting_asks_the_operator_and_relays_in_its_own_chat(self):
        self.set_link("forecasting", "operator", "ask")

        def asks(runtime_request):
            service.ask_agent(ticket_in(runtime_request), "operator", "Which products do we sell?")
            return stream_response(answer("I asked the Operator."))
        with gateway(asks):
            stream = events(self.client.post("/api/agents/forecasting/chat", json={"message": "Forecast tea sales"}))
        kinds = [item["type"] for item in stream]
        self.assertLess(kinds.index("request"), kinds.index("done"))
        conversation = self.client.get("/api/agents/forecasting/conversation").json()
        [request] = conversation["requests"]
        self.assertEqual((request["from_agent"], request["to_name"], request["message_id"]), ("forecasting", "Operator", conversation["messages"][-1]["id"]))
        # The Operator's own conversation does not show Forecasting's request.
        self.assertEqual(self.client.get("/api/conversation").json()["requests"], [])
        captured = []

        def answers(runtime_request):
            captured.append(runtime_request)
            if runtime_request.headers["X-Hermes-Session-Id"].startswith("mula-operator-"):
                return stream_response(answer("We sell tea and coffee."))
            return stream_response(answer("The Operator says you sell tea and coffee."))
        with gateway(answers):
            self.client.post(f"/api/agents/requests/{request['id']}/approve")
        # The Operator answers in the request's own session, not the owner's conversation.
        self.assertNotEqual(captured[0].headers["X-Hermes-Session-Id"], f"mula-operator-{self.project_conversation}")
        # Forecasting relays in its own profile and chat.
        self.assertIn("-forecasting/v1/", str(captured[1].url))
        messages = self.client.get("/api/agents/forecasting/conversation").json()["messages"]
        self.assertEqual((messages[-1]["text"], messages[-1]["note"]), ("The Operator says you sell tea and coffee.", "Answer from Operator"))


if __name__ == "__main__":
    unittest.main()
