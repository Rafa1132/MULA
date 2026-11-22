import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.main import app  # first: the app import settles the features' import order
from src.features.knowledge import grounding, service
from tests.support.account_fixture import AccountFixture


class KnowledgeTests(AccountFixture, unittest.TestCase):
    def add(self, **fields):
        entry = {"kind": "faq", "title": "Opening hours", "body": "We open 08:00 to 17:00, Monday to Saturday.", **fields}
        response = self.client.post("/api/knowledge", json=entry)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_entries_can_be_added_edited_and_removed(self):
        entry = self.add()
        product = self.add(kind="product", title="Nasi goreng", body="Fried rice with egg.", price="Rp 25.000")
        listed = self.client.get("/api/knowledge").json()
        self.assertEqual([item["title"] for item in listed["entries"]], ["Opening hours", "Nasi goreng"])
        self.assertEqual(listed["kinds"]["hours"], "Opening hours")
        changed = self.client.patch(f"/api/knowledge/{product['id']}", json={"kind": "product", "title": "Nasi goreng", "body": "Fried rice.", "price": "Rp 27.000"})
        self.assertEqual(changed.json()["price"], "Rp 27.000")
        self.assertEqual(self.client.delete(f"/api/knowledge/{entry['id']}").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/knowledge/{entry['id']}").status_code, 404)
        self.assertEqual(len(self.client.get("/api/knowledge").json()["entries"]), 1)

    def test_another_project_never_sees_or_changes_entries(self):
        entry = self.add()
        other = TestClient(app, cookies=self.client.cookies)
        self.open_new_project(other, "Second shop")
        self.assertEqual(other.get("/api/knowledge").json()["entries"], [])
        self.assertEqual(other.patch(f"/api/knowledge/{entry['id']}", json={"kind": "faq", "title": "x", "body": "y"}).status_code, 404)
        self.assertEqual(other.delete(f"/api/knowledge/{entry['id']}").status_code, 404)
        self.assertEqual(len(self.client.get("/api/knowledge").json()["entries"]), 1)

    def test_validation_never_echoes_the_text(self):
        for payload in [{"kind": "faq", "title": "", "body": "secretbody"}, {"kind": "menu", "title": "t", "body": "secretbody"},
                        {"kind": "faq", "title": "t", "body": "secretbody" * 500}, {"kind": "faq", "title": "t", "body": "secretbody", "extra": 1}]:
            with self.subTest(payload=str(payload)[:40]):
                response = self.client.post("/api/knowledge", json=payload)
                self.assertEqual(response.status_code, 422)
                self.assertNotIn("secretbody", response.text)
        self.assertEqual(self.client.patch("/api/knowledge/not-an-id", json={"kind": "faq", "title": "t", "body": "b"}).status_code, 404)

    def test_small_bases_are_given_whole_and_large_ones_are_searched(self):
        self.add()
        self.add(kind="policy", title="Returns", body="Unused items can be returned within 7 days.")
        self.assertEqual(len(service.search(self.project["id"], "anything")), 2)
        with patch.object(service, "SMALL_BASE", 1):
            found = service.search(self.project["id"], "returned items")
            self.assertEqual([entry["title"] for entry in found], ["Returns"])
            self.assertEqual(service.search(self.project["id"], "zzzz"), [])

    def test_the_cap_holds(self):
        with patch.object(service, "MAX_ENTRIES", 1):
            self.add()
            self.assertEqual(self.client.post("/api/knowledge", json={"kind": "faq", "title": "t", "body": "b"}).status_code, 409)


class GroundingTests(unittest.TestCase):
    def test_numbers_must_come_from_the_knowledge_base_or_the_customer(self):
        knowledge = "Nasi goreng: Rp 25.000. Open 08:00 to 17:00."
        self.assertEqual(grounding.unsupported_numbers("Nasi goreng is Rp 25,000.", knowledge), set())
        self.assertEqual(grounding.unsupported_numbers("We're open from 08:00 until 17:00.", knowledge), set())
        self.assertEqual(grounding.unsupported_numbers("Nasi goreng is Rp 20.000 today!", knowledge), {"20000"})
        self.assertEqual(grounding.unsupported_numbers("We have 40 in stock.", knowledge), {"40"})
        # The customer's own order number may be repeated back.
        self.assertEqual(grounding.unsupported_numbers("About order 88123: let me check.", knowledge, "Where is order 88123?"), set())
        # Single digits are not facts worth blocking a reply for.
        self.assertEqual(grounding.unsupported_numbers("Give me 1 moment.", knowledge), set())


if __name__ == "__main__":
    unittest.main()
