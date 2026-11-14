import json
import sqlite3
import unittest
from fastapi.testclient import TestClient

from src.features.agents import service as agents
from src.features.agents import tools
from src.features.auth import accounts
from src.features.memory import filters, pipeline, service, store, summary
from src.features.memory.filters import MemoryRefused
from src.main import app
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response


class MemoryTests(AccountFixture, unittest.TestCase):
    def overview(self):
        response = self.client.get("/api/memory")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def add(self, target, fact, status=200):
        response = self.client.post("/api/memory/entries", json={"target": target, "fact": fact})
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def folder(self, account_id=None):
        if account_id is None:
            account_id = self.account["id"]
        return accounts.DB_PATH.parent / "workspaces" / account_id / "memory"

    def test_store_and_summary_are_private_to_the_account(self):
        entry = self.add("business", "Our coffee supplier is Aroma, with deliveries on Tuesdays.")["entry"]
        self.assertEqual(entry["actor"], "owner")
        folder = self.folder()
        self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
        self.assertEqual((folder / "store.sqlite3").stat().st_mode & 0o777, 0o600)
        self.assertEqual((folder / "MEMORY.md").stat().st_mode & 0o777, 0o600)
        self.assertIn("Aroma", (folder / "MEMORY.md").read_text())
        _, other = accounts.create_account("other", "other-long-password")
        self.assertEqual(service.search(other["id"], "Aroma coffee"), [])
        self.assertEqual(service.retrieve(other["id"], "Aroma coffee"), [])
        self.assertNotIn("Aroma", summary.current(other["id"]))
        self.assertTrue(service.retrieve(self.account["id"], "Who supplies our coffee?"))

    def test_summary_lists_only_active_facts_newest_first(self):
        first = self.add("business", "We open at 8 every morning.")["entry"]
        owner = self.add("owner", "The owner likes short answers.")["entry"]
        corrected = self.client.post(f"/api/memory/entries/{first['id']}/supersede", json={"fact": "We open at 9 every morning."})
        self.assertEqual(corrected.status_code, 200, corrected.text)
        replacement = corrected.json()["entry"]
        text = self.overview()["summary"]
        self.assertIn(f"[{replacement['id']}] We open at 9 every morning.", text)
        self.assertNotIn("We open at 8", text)
        self.assertIn(f"[{owner['id']}] The owner likes short answers.", text)
        self.assertLess(text.index("About the business"), text.index("About the owner"))
        # Superseded facts stay in the store with their history, out of retrieval and search.
        entries = {entry["id"]: entry for entry in self.overview()["entries"]}
        self.assertEqual(entries[first["id"]]["superseded_by"], replacement["id"])
        self.assertEqual(entries[first["id"]]["superseded_reason"], "replaced")
        self.assertEqual([source["id"] for source in service.retrieve(self.account["id"], "open morning")], [replacement["id"]])
        self.assertEqual([row["id"] for row in service.search(self.account["id"], "open morning")], [replacement["id"]])
        self.assertNotIn("We open at 8", service.context_for(self.account["id"], []))

    def test_summary_respects_the_runtime_limits(self):
        entries = [{"id": number, "target": "business", "fact": "x" * 200, "created_at": "2026-11-14T00:00:00"} for number in range(1, 30)]
        text = summary.render(entries)
        business = text.split("## About the business")[1].split("## About the owner")[0]
        self.assertLessEqual(len(business.strip()), summary.LIMITS["business"] + 40)
        self.assertIn("more in Memory", business)
        self.assertIn("Nothing saved yet", text.split("## About the owner")[1])

    def test_entries_are_append_only_in_the_database(self):
        entry = self.add("business", "A fact to keep forever.")["entry"]
        path = self.folder() / "store.sqlite3"
        with sqlite3.connect(path) as db:
            for statement in ("DELETE FROM entries", "UPDATE entries SET fact = 'changed'", "DELETE FROM audit", "UPDATE audit SET action = 'x'"):
                with self.subTest(statement=statement), self.assertRaises(sqlite3.IntegrityError):
                    db.execute(statement)
        retired = self.client.post(f"/api/memory/entries/{entry['id']}/retire")
        self.assertEqual(retired.status_code, 200)
        self.assertEqual(retired.json()["entry"]["superseded_reason"], "retired")
        with sqlite3.connect(path) as db:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE entries SET superseded_at = NULL WHERE id = ?", (entry["id"],))
        self.assertEqual(self.client.post(f"/api/memory/entries/{entry['id']}/retire").status_code, 409)
        self.assertEqual(self.client.post(f"/api/memory/entries/{entry['id']}/supersede", json={"fact": "Later"}).status_code, 409)
        self.assertEqual(self.client.post("/api/memory/entries/999/retire").status_code, 404)

    def test_pipeline_dedupes_refuses_and_audits(self):
        saved = pipeline.remember(self.account["id"], "business", "Our coffee supplier is Aroma.", "operator", origin_message_id=7)
        again = pipeline.remember(self.account["id"], "business", "our coffee supplier is aroma!", "owner")
        self.assertEqual(again["outcome"], "duplicate")
        self.assertEqual(again["entry"]["id"], saved["entry"]["id"])
        near = pipeline.remember(self.account["id"], "business", "Our coffee supplier is Aroma today.", "owner")
        self.assertEqual(near["outcome"], "duplicate")
        for secret in ["API key: sk-live-abcdefghijklmnopqrstuvwxyz", "The card number is 4111 1111 1111 1111",
                       "Customer Budi's phone is 0812 3456 7890", "password = hunter2xx", "x" * 501, "ab", "Line\x00break"]:
            with self.subTest(secret=secret), self.assertRaises(MemoryRefused):
                pipeline.remember(self.account["id"], "owner", secret, "owner")
        # The business's own contact details are fine.
        pipeline.remember(self.account["id"], "business", "Our shop's phone is 0812 3456 7890.", "owner")
        audit = self.overview()["audit"]
        actions = [row["action"] for row in audit]
        self.assertEqual(actions.count("refused"), 7)
        self.assertEqual(actions.count("duplicate"), 2)
        self.assertEqual(actions.count("saved"), 2)
        self.assertNotIn("hunter2xx", json.dumps(audit))
        self.assertNotIn("Aroma", json.dumps(audit))
        self.assertEqual(pipeline.saved_by_message(self.account["id"], 7)[0]["id"], saved["entry"]["id"])

    def test_related_facts_are_flagged_not_merged(self):
        self.add("business", "Deliveries arrive on Tuesdays from Aroma.")
        self.add("business", "Deliveries arrive on Fridays from Aroma.")
        entries = [entry for entry in self.overview()["entries"] if not entry["superseded"]]
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["related"], [entries[1]["id"]])

    def test_authentication_and_validation(self):
        self.assertEqual(TestClient(app).get("/api/memory").status_code, 401)
        response = self.client.post("/api/memory/entries", json={"target": "secrets", "fact": "PRIVATE"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("PRIVATE", response.text)
        self.add("owner", "password: PRIVATE-VALUE", status=422)
        self.assertEqual(self.client.post("/api/memory/search", json={"question": '" OR 1=1; --'}).status_code, 200)

    def test_memory_is_in_current_system_prompt_not_persisted_user_text(self):
        entry = self.add("business", "Our coffee supplier is Aroma.")["entry"]
        requests = []
        def handler(request):
            requests.append(json.loads(request.content))
            return stream_response(answer("Aroma supplies the coffee."))
        with gateway(handler):
            response = self.client.post("/api/agents/operator/chat", json={"message": "Who supplies coffee?", "stream": True})
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual(events[-1]["type"], "done")
        memory_event = next(event for event in events if event["type"] == "memory")
        self.assertEqual(memory_event["note"], f"Memory used: [{entry['id']}]")
        system = requests[0]["messages"][0]["content"]
        self.assertIn("About the business", system)
        self.assertIn(f"[{entry['id']}] Our coffee supplier is Aroma.", system)
        self.assertIn("Use remember to save", system)
        self.assertEqual(requests[0]["messages"][-1]["content"], "Who supplies coffee?")
        self.assertNotIn("tools", requests[0])
        snapshot = self.overview()["last_retrieval"]
        self.assertEqual(snapshot["entries"][0]["id"], entry["id"])

    def test_remember_command_saves_and_reports_duplicates(self):
        with gateway(lambda request: stream_response(answer("Saved."))):
            first = self.client.post("/api/agents/operator/chat", json={"message": "/remember owner | I enjoy surfing.", "stream": True})
            second = self.client.post("/api/agents/operator/chat", json={"message": "/remember owner | I enjoy surfing.", "stream": True})
            refused = self.client.post("/api/agents/operator/chat", json={"message": "/remember token = abc123def456ghi789"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(refused.status_code, 422)
        notes = [json.loads(line)["note"] for line in first.text.splitlines() + second.text.splitlines() if json.loads(line)["type"] == "memory"]
        self.assertTrue(notes[0].startswith("Saved to memory as ["))
        self.assertTrue(notes[1].startswith("Already in memory as ["))
        entries = [entry for entry in self.overview()["entries"] if not entry["superseded"]]
        self.assertEqual([(entry["target"], entry["fact"]) for entry in entries], [("owner", "I enjoy surfing.")])
        self.assertEqual(self.client.post("/api/agents/operator/chat", json={"message": "/remember elsewhere | fact"}).status_code, 422)

    def test_operator_saves_through_the_remember_tool(self):
        reply_id = accounts.add_message(self.account["id"], "assistant", "", None)
        ticket = agents.issue_ticket(self.account["id"], "operator", message_id=reply_id)
        result = tools.remember(ticket, "business", "The shop closes on Sundays.")
        self.assertTrue(result.startswith("Saved as memory ["))
        entry = pipeline.saved_by_message(self.account["id"], reply_id)[0]
        self.assertEqual(entry["actor"], "operator")
        self.assertTrue(tools.remember(ticket, "business", "The shop closes on Sundays.").startswith("Already in memory"))
        corrected = tools.remember(ticket, "business", "The shop closes on Mondays.", replaces=entry["id"])
        self.assertIn(f"replacing [{entry['id']}]", corrected)
        with self.assertRaises(tools.ToolError) as refusal:
            tools.remember(ticket, "owner", "My PIN: 1234")
        self.assertIn("Not saved", str(refusal.exception))
        forecasting = agents.issue_ticket(self.account["id"], "forecasting")
        with self.assertRaises(tools.ToolError):
            tools.remember(forecasting, "business", "Forecasting may not remember.")
        # The chat note under the reply says what this turn saved.
        self.client.put("/api/team/operator", json={"prompt": "", "data": "", "tools": ["csv_read", "memory_read"], "revision": 0, "brain": "qwen", "delegation": "ask"})
        with self.assertRaises(tools.ToolError):
            tools.remember(ticket, "business", "Saving is off now.")

    def test_turn_that_saved_reports_it_in_the_stream(self):
        saved_ids = []
        def handler(request):
            # Stand in for the runtime calling the remember tool during the turn.
            ticket = json.loads(request.content)["messages"][0]["content"].split("every Mula tool call: ")[1].split()[0]
            saved_ids.append(int(tools.remember(ticket, "business", "We sell tea.").split("[")[1].split("]")[0]))
            return stream_response(answer("Noted."))
        with gateway(handler):
            response = self.client.post("/api/agents/operator/chat", json={"message": "We sell tea.", "stream": True})
        events = [json.loads(line) for line in response.text.splitlines()]
        memory_events = [event for event in events if event["type"] == "memory"]
        self.assertEqual(memory_events[-1]["note"], f"Saved to memory: [{saved_ids[0]}]")
        history = self.client.get("/api/conversation").json()["messages"]
        self.assertEqual(history[-1]["note"], f"Saved to memory: [{saved_ids[0]}]")

    def test_filters(self):
        self.assertEqual(filters.normalize("  Café  Aroma, Tuesdays! "), "cafe aroma tuesdays")
        self.assertGreaterEqual(filters.similarity("our coffee supplier is aroma", "our coffee supplier is aroma today"), 0.8)
        self.assertIsNone(filters.sensitive_reason("Invoice total 1234567 rupiah"))
        self.assertIsNotNone(filters.sensitive_reason("NIK 3175012345678901"))
        self.assertIsNone(filters.sensitive_reason("Our email is shop@example.com"))
        self.assertIsNotNone(filters.sensitive_reason("Employee Sari's email is sari@example.com"))
