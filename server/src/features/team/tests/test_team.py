import json
import unittest
from unittest.mock import patch
import httpx
from src.common.brains import BRAINS, DEFAULT_BRAIN
from src.features.auth import accounts
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response


class TeamTests(AccountFixture, unittest.TestCase):
    def test_only_real_agents_and_persistent_settings(self):
        agents = self.client.get("/api/team").json()["agents"]
        self.assertEqual([agent["id"] for agent in agents], ["operator", "forecasting"])
        saved = self.client.put("/api/team/operator", json={"prompt": "Be brief", "data": "We sell tea", "tools": ["csv_read"], "revision": 0, "brain": "qwen", "delegation": "ask"})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["revision"], 1)
        self.assertEqual(self.client.get("/api/team").json()["agents"][0], saved.json())
        self.assertEqual(self.client.put("/api/team/operator", json={"prompt": "Lost update", "data": "", "tools": [], "revision": 0, "brain": "qwen", "delegation": "ask"}).status_code, 409)

    def test_isolation_and_allowlist(self):
        payload = {"prompt": "Private", "data": "", "tools": ["shell"], "revision": 0, "brain": "qwen", "delegation": "ask"}
        self.assertEqual(self.client.put("/api/team/operator", json=payload).status_code, 422)
        payload["tools"] = []
        self.assertEqual(self.client.put("/api/team/inventory", json=payload).status_code, 404)
        self.assertEqual(self.client.put("/api/team/operator", json=payload).status_code, 200)
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.get("/api/team").status_code, 401)
        self.client.post("/api/auth/signup", json={"username": "other", "password": "long-password-123"})
        self.assertEqual(self.client.get("/api/team").json()["agents"][0]["prompt"], "")

    def test_operator_tools_are_enforced_and_prompt_reaches_gateway(self):
        self.client.put("/api/team/operator", json={"prompt": "Use Indonesian", "data": "Our shop sells tea", "tools": [], "revision": 0, "brain": "qwen", "delegation": "ask"})
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


def models_response(*aliases):
    return httpx.Response(200, json={"object": "list", "data": [{"id": alias} for alias in ("hermes-agent", *aliases)]})


class BrainSettingsTests(AccountFixture, unittest.TestCase):
    def save(self, agent_id, **changes):
        payload = {"prompt": "", "data": "", "tools": [], "revision": 0, **changes}
        if agent_id == "operator":
            payload.setdefault("delegation", "ask")
        return self.client.put(f"/api/team/{agent_id}", json=payload)

    def test_every_agent_defaults_to_local_brain_and_lists_choices(self):
        for agent in self.client.get("/api/team").json()["agents"]:
            with self.subTest(agent=agent["id"]):
                self.assertEqual(agent["brain"], DEFAULT_BRAIN)
                self.assertEqual(list(agent["available_brains"]), list(BRAINS))
                self.assertNotIn("alias", json.dumps(agent["available_brains"]))

    def test_brain_choice_is_validated_and_persisted(self):
        self.assertEqual(self.save("operator").status_code, 422)
        self.assertEqual(self.save("operator", brain="gpt-4o").status_code, 422)
        self.assertEqual(self.save("forecasting").status_code, 422)
        saved = self.save("operator", brain="claude-sonnet")
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.save("forecasting", brain="claude-opus").status_code, 200)
        operator, forecasting = self.client.get("/api/team").json()["agents"]
        self.assertEqual((operator["brain"], forecasting["brain"]), ("claude-sonnet", "claude-opus"))

    def test_statuses_follow_the_runtime_model_list(self):
        with gateway(lambda request: models_response("mula-claude-sonnet")):
            brains = self.client.get("/api/team").json()["agents"][0]["available_brains"]
        self.assertEqual(brains["qwen"]["status"], "ready")
        self.assertEqual(brains["claude-sonnet"]["status"], "ready")
        self.assertEqual(brains["claude-opus"]["status"], "needs_setup")
        with gateway(lambda request: httpx.Response(503)):
            brains = self.client.get("/api/team").json()["agents"][0]["available_brains"]
        self.assertEqual(brains["qwen"]["status"], "ready")
        self.assertEqual(brains["claude-opus"]["status"], "unchecked")
        with gateway(lambda request: models_response()):
            saved = self.save("operator", brain="qwen").json()
        self.assertEqual(saved["available_brains"]["claude-haiku"]["status"], "needs_setup")

    def test_database_from_before_brains_is_migrated(self):
        with accounts.database() as db:
            db.execute("""CREATE TABLE agent_settings (
                account_id TEXT NOT NULL REFERENCES accounts(id), agent_id TEXT NOT NULL,
                prompt TEXT NOT NULL, data TEXT NOT NULL, tools TEXT NOT NULL, revision INTEGER NOT NULL,
                PRIMARY KEY (account_id, agent_id))""")
            db.execute("INSERT INTO agent_settings VALUES (?, 'operator', 'Old prompt', '', '[]', 1)", (self.account["id"],))
        operator = self.client.get("/api/team").json()["agents"][0]
        self.assertEqual((operator["prompt"], operator["brain"], operator["delegation"]), ("Old prompt", DEFAULT_BRAIN, "ask"))
        saved = self.save("operator", brain="claude-haiku", revision=1, delegation="auto").json()
        self.assertEqual((saved["brain"], saved["delegation"]), ("claude-haiku", "auto"))


class DelegationSettingsTests(AccountFixture, unittest.TestCase):
    def save(self, agent_id, **changes):
        payload = {"prompt": "", "data": "", "tools": [], "revision": 0, "brain": "qwen", **changes}
        return self.client.put(f"/api/team/{agent_id}", json=payload)

    def test_operator_asks_first_by_default_and_only_it_has_the_setting(self):
        operator, forecasting = self.client.get("/api/team").json()["agents"]
        self.assertEqual((operator["delegation"], operator["delegates_to"]), ("ask", ["forecasting"]))
        self.assertEqual((forecasting["delegation"], forecasting["delegates_to"]), (None, []))

    def test_delegation_is_validated_and_persisted(self):
        self.assertEqual(self.save("operator").status_code, 422)
        self.assertEqual(self.save("operator", delegation="maybe").status_code, 422)
        self.assertEqual(self.save("forecasting", delegation="ask").status_code, 422)
        for revision, mode in enumerate(("off", "auto", "ask")):
            with self.subTest(mode=mode):
                saved = self.save("operator", delegation=mode, revision=revision)
                self.assertEqual(saved.status_code, 200, saved.text)
                self.assertEqual(self.client.get("/api/team").json()["agents"][0]["delegation"], mode)
        self.assertEqual(self.save("forecasting").status_code, 200)


class MapLayoutTests(AccountFixture, unittest.TestCase):
    def test_layout_is_saved_replaced_and_reset(self):
        self.assertEqual(self.client.get("/api/team").json()["layout"], {})
        positions = {"operator": {"x": 0.25, "y": 0.5}, "forecasting": {"x": 1, "y": 0}}
        saved = self.client.put("/api/team/layout", json={"positions": positions})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["layout"], positions)
        self.assertEqual(self.client.get("/api/team").json()["layout"], positions)
        self.client.put("/api/team/layout", json={"positions": {"operator": {"x": 0.9, "y": 0.1}}})
        self.assertEqual(self.client.get("/api/team").json()["layout"], {"operator": {"x": 0.9, "y": 0.1}})
        self.assertEqual(self.client.delete("/api/team/layout").json()["layout"], {})
        self.assertEqual(self.client.get("/api/team").json()["layout"], {})

    def test_invalid_layouts_change_nothing(self):
        self.client.put("/api/team/layout", json={"positions": {"operator": {"x": 0.5, "y": 0.5}}})
        invalid = [
            {"positions": {"operator": {"x": 1.5, "y": 0.5}}},
            {"positions": {"operator": {"x": -0.1, "y": 0.5}}},
            {"positions": {"operator": {"x": "0.5", "y": 0.5}}},
            {"positions": {"operator": {"x": True, "y": 0.5}}},
            {"positions": {"operator": {"x": 0.5}}},
            {"positions": {"operator": {"x": 0.5, "y": 0.5, "z": 1}}},
            {"positions": {"inventory": {"x": 0.5, "y": 0.5}}},
            {"positions": {f"agent{index}": {"x": 0.5, "y": 0.5} for index in range(21)}},
            {"positions": {}, "extra": True},
            {},
        ]
        for payload in invalid:
            with self.subTest(payload=str(payload)[:80]):
                self.assertEqual(self.client.put("/api/team/layout", json=payload).status_code, 422)
        raw = self.client.put("/api/team/layout", content='{"positions": {"operator": {"x": NaN, "y": 0.5}}}', headers={"Content-Type": "application/json"})
        self.assertEqual(raw.status_code, 422)
        self.assertEqual(self.client.get("/api/team").json()["layout"], {"operator": {"x": 0.5, "y": 0.5}})

    def test_layout_is_independent_of_settings_and_accounts(self):
        saved = self.client.put("/api/team/operator", json={"prompt": "", "data": "", "tools": [], "revision": 0, "brain": "qwen", "delegation": "ask"}).json()
        self.client.put("/api/team/layout", json={"positions": {"operator": {"x": 0.1, "y": 0.2}}})
        self.assertEqual(self.client.get("/api/team").json()["agents"][0]["revision"], saved["revision"])
        # The settings form opened before the drag can still save without a conflict.
        again = self.client.put("/api/team/operator", json={"prompt": "Still saves", "data": "", "tools": [], "revision": saved["revision"], "brain": "qwen", "delegation": "ask"})
        self.assertEqual(again.status_code, 200)
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.put("/api/team/layout", json={"positions": {}}).status_code, 401)
        self.client.post("/api/auth/signup", json={"username": "other", "password": "long-password-123"})
        self.assertEqual(self.client.get("/api/team").json()["layout"], {})
