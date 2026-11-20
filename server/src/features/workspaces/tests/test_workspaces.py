import unittest
from uuid import uuid4

from fastapi.testclient import TestClient

from src.common import database
from src.features.auth import accounts
from src.main import app
from tests.support.account_fixture import AccountFixture


class ProjectTests(AccountFixture, unittest.TestCase):
    def test_signup_makes_a_workspace_and_projects_are_named_or_untitled(self):
        workspace = self.client.get("/api/workspace").json()
        self.assertEqual([project["name"] for project in workspace["projects"]], ["Test business"])
        untitled = self.client.post("/api/projects", json={}).json()
        self.assertEqual((untitled["name"], untitled["display_name"], untitled["role"]), (None, "Untitled project", "owner"))
        blank = self.client.post("/api/projects", json={"name": "   "}).json()
        self.assertIsNone(blank["name"])
        self.assertEqual(self.client.post("/api/projects", json={"name": "x" * 81}).status_code, 422)
        renamed = self.client.patch(f"/api/projects/{untitled['id']}", json={"name": "  Kopi   Senja "}).json()
        self.assertEqual((renamed["name"], renamed["display_name"]), ("Kopi Senja", "Kopi Senja"))
        # Oldest first, so the switcher's order stays put.
        self.assertEqual([project["display_name"] for project in self.client.get("/api/projects").json()],
                         ["Test business", "Kopi Senja", "Untitled project"])
        opened = self.client.get("/api/project", headers={"X-Mula-Project": untitled["id"]}).json()
        self.assertEqual(opened["display_name"], "Kopi Senja")

    def test_project_routes_need_a_project_the_account_belongs_to(self):
        without = TestClient(app)
        without.cookies.set("mula_session", self.client.cookies.get("mula_session"))
        self.assertEqual(without.get("/api/memory").status_code, 400)
        for bad in ("not-a-uuid", str(uuid4())):
            self.assertEqual(self.client.get("/api/memory", headers={"X-Mula-Project": bad}).status_code, 404)
        other = TestClient(app)
        _, other_project = self.switch_to_new_account("other", other)
        # Another account's project looks the same as one that doesn't exist, for reads and renames.
        for path in ("/api/memory", "/api/conversation", "/api/team", "/api/memory/graph", "/api/project"):
            self.assertEqual(other.get(path, headers={"X-Mula-Project": self.project["id"]}).status_code, 404, path)
        self.assertEqual(other.patch(f"/api/projects/{self.project['id']}", json={"name": "Mine now"}).status_code, 404)
        self.assertEqual([project["id"] for project in other.get("/api/projects").json()], [other_project["id"]])

    def test_each_project_keeps_its_own_memory_and_conversation(self):
        self.client.post("/api/memory/entries", json={"target": "business", "fact": "The bakery opens at six in the morning."})
        second = self.client.post("/api/projects", json={"name": "Coffee cart"}).json()
        header = {"X-Mula-Project": second["id"]}
        self.assertEqual(self.client.get("/api/memory", headers=header).json()["entries"], [])
        self.assertNotEqual(self.client.get("/api/conversation", headers=header).json()["session_id"], self.project_conversation)
        self.assertEqual(len(self.client.get("/api/memory").json()["entries"]), 1)


class MigrationTests(AccountFixture, unittest.TestCase):
    def test_existing_accounts_become_their_first_project(self):
        # Rebuild the schema at the first revision with one account and its data, then upgrade.
        with database.database() as db:
            db.execute("DROP SCHEMA %s CASCADE" % database.quote_identifier(self.schema))
            db.execute("CREATE SCHEMA %s" % database.quote_identifier(self.schema))
        database.migrate(revision="0001_initial")
        with database.database() as db:
            db.execute("INSERT INTO accounts (id, username, salt, password_hash, conversation_id) VALUES ('a1', 'old', 's', 'h', 'conv-1')")
            db.execute("INSERT INTO messages (account_id, role, text) VALUES ('a1', 'user', 'Before projects')")
            db.execute("INSERT INTO agent_settings (account_id, agent_id, prompt, data, tools, revision) VALUES ('a1', 'operator', 'p', '', '[]'::jsonb, 1)")
        database.migrate()
        with database.database() as db:
            project = db.execute("SELECT * FROM projects").fetchone()
            member = db.execute("SELECT * FROM project_members").fetchone()
            owner = db.execute("SELECT owner_account_id FROM workspaces WHERE id = %s", (project["workspace_id"],)).fetchone()
        # The project id is the account id, so the memory folder and runtime profile follow as they are.
        self.assertEqual((project["id"], project["conversation_id"], project["name"]), ("a1", "conv-1", None))
        self.assertEqual((member["account_id"], member["role"]), ("a1", "owner"))
        self.assertEqual(owner["owner_account_id"], "a1")
        self.assertEqual([message["text"] for message in accounts.history("a1")], ["Before projects"])
