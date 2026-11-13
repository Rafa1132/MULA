import json
import unittest
from unittest.mock import patch
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response


class TeamTests(AccountFixture, unittest.TestCase):
    def test_only_real_agents_and_persistent_settings(self):
        agents = self.client.get("/api/team").json()["agents"]
        self.assertEqual([agent["id"] for agent in agents], ["operator", "forecasting"])
        saved = self.client.put("/api/team/operator", json={"prompt": "Be brief", "data": "We sell tea", "tools": ["csv_read"], "revision": 0})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["revision"], 1)
        self.assertEqual(self.client.get("/api/team").json()["agents"][0], saved.json())
        self.assertEqual(self.client.put("/api/team/operator", json={"prompt": "Lost update", "data": "", "tools": [], "revision": 0}).status_code, 409)

    def test_isolation_and_allowlist(self):
        payload = {"prompt": "Private", "data": "", "tools": ["shell"], "revision": 0}
        self.assertEqual(self.client.put("/api/team/operator", json=payload).status_code, 422)
        payload["tools"] = []
        self.assertEqual(self.client.put("/api/team/inventory", json=payload).status_code, 404)
        self.assertEqual(self.client.put("/api/team/operator", json=payload).status_code, 200)
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.get("/api/team").status_code, 401)
        self.client.post("/api/auth/signup", json={"username": "other", "password": "long-password-123"})
        self.assertEqual(self.client.get("/api/team").json()["agents"][0]["prompt"], "")

    def test_operator_tools_are_enforced_and_prompt_reaches_gateway(self):
        self.client.put("/api/team/operator", json={"prompt": "Use Indonesian", "data": "Our shop sells tea", "tools": [], "revision": 0})
        self.assertEqual(self.client.post("/api/agents/operator/chat", json={"message": "hi", "csv_file": {"name": "x.csv", "content": "x\n1"}}).status_code, 403)
        self.assertEqual(self.client.post("/api/agents/operator/chat", json={"message": "/remember A fact"}).status_code, 403)
        requests = []
        def handler(req):
            requests.append(req)
            return stream_response(answer())
        with gateway(handler), patch("src.features.memory.service.retrieve") as retrieve:
            result = self.client.post("/api/agents/operator/chat", json={"message": "Hello", "stream": True})
            self.assertEqual(result.status_code, 200)
            retrieve.assert_not_called()
        prompt = json.loads(requests[0].content)["messages"][0]["content"]
        self.assertIn("Use Indonesian", prompt)
        self.assertIn("Our shop sells tea", prompt)
        self.assertIn("Currently disabled application capabilities", prompt)
