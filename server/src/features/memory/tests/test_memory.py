import json
from pathlib import Path
import unittest
from fastapi.testclient import TestClient

from src.features.auth import accounts
from src.features.memory import service
from src.main import app
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response


class MemoryTests(AccountFixture, unittest.TestCase):
    def overview(self):
        response = self.client.get("/api/memory")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def save(self, path, content):
        document = next(file for file in self.overview()["files"] if file["path"] == path)
        response = self.client.put("/api/memory/document", json={"path": path, "content": content, "revision": document["revision"]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_tree_and_owner_only_permissions(self):
        data = self.overview()
        self.assertEqual(len(data["files"]), 13)
        self.assertTrue(all(not file["content"] for file in data["files"]))
        folder = accounts.DB_PATH.parent / "workspaces" / self.account["id"] / "memory"
        self.assertTrue((folder / "INDEX.md").is_file())
        self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
        self.assertEqual((folder / "important-facts/goals.md").stat().st_mode & 0o777, 0o600)

    def test_files_are_source_of_truth_and_retrieval_is_scoped(self):
        self.save("business-knowledge/suppliers.md", "Our coffee supplier is Aroma, with deliveries on Tuesdays.")
        results = service.retrieve(self.account["id"], "Who supplies our coffee?")
        self.assertTrue(any("Aroma" in source["content"] for source in results))
        _, other = accounts.create_account("other", "other-long-password")
        self.assertEqual(service.search(other["id"], "Aroma coffee"), [])
        self.assertEqual(service.retrieve(other["id"], "Aroma coffee"), [])
        with service.workspace(self.account["id"]) as folder:
            (folder / "business-knowledge/suppliers.md").write_text("Our coffee supplier is Kopi Baru.", encoding="utf-8")
        self.assertEqual(service.search(self.account["id"], "Aroma"), [])
        self.assertTrue(service.search(self.account["id"], "Kopi Baru"))
        document = next(file for file in self.overview()["files"] if file["path"] == "business-knowledge/suppliers.md")
        self.assertEqual(document["source"], "Manual file edit")

    def test_essentials_are_always_included_and_superseded_is_not(self):
        self.save("important-facts/boundaries.md", "Purchases above 500 require owner review.")
        self.save("fun-facts/interests.md", "The owner enjoys surfing in Bali.")
        self.save("decisions/superseded.md", "Our coffee supplier used to be Previous Beans.")
        sources = service.retrieve(self.account["id"], "Hello")
        self.assertEqual([source["path"] for source in sources], ["important-facts/boundaries.md"])
        self.assertTrue(service.search(self.account["id"], "Previous Beans"))
        self.assertFalse(any(source["path"] == "decisions/superseded.md" for source in service.retrieve(self.account["id"], "Previous Beans coffee")))

    def test_clear_and_manual_delete_remove_stale_search_results(self):
        self.save("random-facts/miscellaneous.md", "A unique purple zeppelin.")
        self.assertTrue(service.search(self.account["id"], "zeppelin"))
        self.save("random-facts/miscellaneous.md", "")
        self.assertEqual(service.search(self.account["id"], "zeppelin"), [])
        self.save("business-knowledge/products-and-services.md", "We sell marshmallow lemonade.")
        with service.workspace(self.account["id"]) as folder:
            (folder / "business-knowledge/products-and-services.md").unlink()
        self.assertEqual(service.search(self.account["id"], "marshmallow"), [])

    def test_stale_edits_and_invalid_paths_are_rejected(self):
        old = self.save("important-facts/goals.md", "Grow to two stores.")
        self.save("important-facts/goals.md", "Grow to three stores.")
        result = self.client.put("/api/memory/document", json={"path": old["path"], "revision": old["revision"], "content": "Overwrite"})
        self.assertEqual(result.status_code, 409)
        for path in ["../../secrets.md", "../other/memory/goals.md", "unknown/test.md"]:
            result = self.client.put("/api/memory/document", json={"path": path, "revision": "", "content": "No"})
            self.assertEqual(result.status_code, 422)

    def test_symlink_files_are_not_followed(self):
        self.overview()
        outside = accounts.DB_PATH.parent / "outside.txt"
        outside.write_text("PRIVATE")
        with service.workspace(self.account["id"]) as folder:
            target = folder / "business-knowledge/suppliers.md"
            target.unlink()
            target.symlink_to(outside)
        response = self.client.get("/api/memory")
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("PRIVATE", response.text)

    def test_authentication_and_validation(self):
        self.assertEqual(TestClient(app).get("/api/memory").status_code, 401)
        response = self.client.put("/api/memory/document", json={"path": "bad", "content": "PRIVATE"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("PRIVATE", response.text)
        self.assertEqual(self.client.post("/api/memory/search", json={"question": '" OR 1=1; --'}).status_code, 200)

    def test_memory_is_in_current_system_prompt_not_persisted_user_text(self):
        self.save("business-knowledge/suppliers.md", "Our coffee supplier is Aroma.")
        requests = []
        def handler(request):
            requests.append(json.loads(request.content))
            return stream_response(answer("Aroma supplies the coffee."))
        with gateway(handler):
            response = self.client.post("/api/agents/operator/chat", json={"message": "Who supplies coffee?", "stream": True})
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual(events[-1]["type"], "done")
        self.assertTrue(any(event["type"] == "memory" for event in events))
        self.assertIn("Aroma", requests[0]["messages"][0]["content"])
        self.assertEqual(requests[0]["messages"][-1]["content"], "Who supplies coffee?")
        self.assertNotIn("tools", requests[0])
        snapshot = self.overview()["last_retrieval"]
        self.assertIn("Aroma", snapshot["sources"][0]["content"])

    def test_remember_command_saves_explicit_fact_and_is_idempotent(self):
        with gateway(lambda request: stream_response(answer("Saved."))):
            for _ in range(2):
                response = self.client.post("/api/agents/operator/chat", json={"message": "/remember fun-facts/interests.md | I enjoy surfing.", "stream": True})
                self.assertEqual(response.status_code, 200)
        document = next(file for file in self.overview()["files"] if file["path"] == "fun-facts/interests.md")
        self.assertEqual(document["content"], "I enjoy surfing.")
        with service.workspace(self.account["id"]) as folder:
            audit = (folder / "changes.jsonl").read_text()
        self.assertNotIn("surfing", audit)
        self.assertEqual(len(audit.splitlines()), 1)
