import os
import stat
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.common import database
from src.features.orchestrator import assistant, user_file
from src.features.operator import runtime
from src.main import app
from tests.support.account_fixture import AccountFixture


class OnboardingTests(AccountFixture, unittest.TestCase):
    def user_md(self, account_id=None):
        if account_id is None:
            account_id = self.account["id"]
        return self.data_dir / "users" / account_id / "USER.md"

    def test_questions_one_at_a_time_written_to_user_md_as_they_go(self):
        state = self.client.get("/api/onboarding").json()
        self.assertEqual((state["status"], state["step"]), ("active", "assistant_name"))
        self.assertIn("Skip", state["greeting"])
        self.assertEqual([question["id"] for question in state["questions"]], ["assistant_name", "name", "business", "help", "style"])
        # Naming the assistant comes first, and never touches USER.md.
        state = self.client.post("/api/onboarding/answer", json={"step": "assistant_name", "answer": " Sari "}).json()
        self.assertEqual((state["step"], state["assistant_name"]), ("name", "Sari"))
        self.assertFalse(self.user_md().exists())
        state = self.client.post("/api/onboarding/answer", json={"step": "name", "answer": "  Rafa  "}).json()
        self.assertEqual(state["step"], "business")
        # Written straight away, owner-only, outside every project folder.
        path = self.user_md()
        self.assertIn("## Name\n\nRafa\n", path.read_text())
        self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(os.stat(path.parent).st_mode), 0o700)
        self.assertEqual(self.client.post("/api/onboarding/skip", json={"step": "business"}).json()["step"], "help")
        self.client.post("/api/onboarding/answer", json={"step": "help", "answer": "Stock planning"})
        state = self.client.post("/api/onboarding/answer", json={"step": "style", "answer": "Short and direct"}).json()
        self.assertEqual(state["step"], "summary")
        self.assertEqual(state["about"], {"name": "Rafa", "business": None, "help": "Stock planning", "style": "Short and direct"})
        # The summary can be edited before it is accepted.
        edited = {"name": "Rafa", "business": "A coffee cart", "help": "Stock planning", "style": ""}
        state = self.client.post("/api/onboarding/summary", json={"about": edited}).json()
        self.assertEqual((state["step"], state["about"]["business"], state["about"]["style"]), ("personality", "A coffee cart", None))
        self.assertIn("## How to answer\n\n(not given)", path.read_text())
        state = self.client.post("/api/onboarding/personality", json={"tone": "neutral", "formality": "formal", "language": "id", "emoji": "none"}).json()
        self.assertEqual((state["status"], state["finished"]), ("done", "completed"))
        self.assertEqual(state["personality"]["language"], "id")
        # Finished: it doesn't run again unless restarted.
        self.assertEqual(self.client.get("/api/onboarding").json()["status"], "done")

    def test_a_step_is_answered_once_and_bad_answers_keep_the_question_open(self):
        self.client.post("/api/onboarding/skip", json={"step": "assistant_name"})
        self.client.post("/api/onboarding/answer", json={"step": "name", "answer": "Rafa"})
        # A double submit, or a second tab, can't answer a step that's already done.
        self.assertEqual(self.client.post("/api/onboarding/answer", json={"step": "name", "answer": "Again"}).status_code, 409)
        for refused in ("", "   ", "my password is hunter2", "PIN saya adalah 1234", "email me at rafa@example.com", "call +62 812 3456 7890",
                        "card 4111 1111 1111 1111", "x" * 301):
            response = self.client.post("/api/onboarding/answer", json={"step": "business", "answer": refused})
            self.assertEqual(response.status_code, 422, refused)
        self.assertEqual(self.client.get("/api/onboarding").json()["step"], "business")
        self.assertNotIn("hunter2", self.user_md().read_text())
        self.assertEqual(self.client.post("/api/onboarding/answer", json={"step": "nope", "answer": "x"}).status_code, 422)
        self.assertEqual(self.client.post("/api/onboarding/personality", json={"tone": "warm"}).status_code, 409)

    def test_skip_for_now_leaves_a_usable_workspace_and_settings_can_restart(self):
        self.client.post("/api/onboarding/skip", json={"step": "assistant_name"})
        self.client.post("/api/onboarding/answer", json={"step": "name", "answer": "Rafa"})
        state = self.client.post("/api/onboarding/skip-all").json()
        self.assertEqual((state["status"], state["finished"]), ("done", "skipped"))
        self.assertEqual(self.client.get("/api/workspace").status_code, 200)
        self.assertEqual(self.client.get("/api/conversation").status_code, 200)
        # Restarting asks again from the first question; what USER.md has stays until it is replaced.
        state = self.client.post("/api/onboarding/restart").json()
        self.assertEqual((state["status"], state["step"], state["about"]["name"]), ("active", "assistant_name", "Rafa"))
        # Skipping the personality step still finishes, with the default personality.
        for step in ("assistant_name", "name", "business", "help", "style", "summary"):
            self.client.post("/api/onboarding/skip", json={"step": step})
        state = self.client.post("/api/onboarding/skip", json={"step": "personality"}).json()
        self.assertEqual((state["finished"], state["personality"]), ("completed", None))

    def test_settings_change_the_profile_and_the_personality(self):
        response = self.client.put("/api/orchestrator/profile", json={"name": "Rafa", "business": "Bakery"})
        self.assertEqual(response.json()["about"], {"name": "Rafa", "business": "Bakery", "help": None, "style": None})
        self.assertEqual(self.client.put("/api/orchestrator/profile", json={"name": "pin 123456 password: x"}).status_code, 422)
        self.assertEqual(self.client.put("/api/orchestrator/personality", json={"tone": "loud"}).status_code, 422)
        self.assertEqual(self.client.put("/api/orchestrator/personality", json={"extra": "x"}).status_code, 422)
        saved = self.client.put("/api/orchestrator/personality", json={"tone": "playful", "emoji": "some"}).json()
        self.assertEqual(saved["personality"], {"tone": "playful", "formality": "casual", "language": "en", "emoji": "some"})
        profile = self.client.get("/api/orchestrator/profile").json()
        self.assertEqual((profile["about"]["business"], profile["personality"]["tone"]), ("Bakery", "playful"))

    def test_another_account_never_sees_this_profile_or_chat(self):
        self.client.put("/api/orchestrator/profile", json={"name": "Rafa", "business": "Bakery"})
        assistant.add_message(self.account["id"], "user", "private note")
        other = TestClient(app)
        other_account, _ = self.switch_to_new_account("teammate", other)
        self.assertEqual(other.get("/api/orchestrator/profile").json()["about"]["name"], None)
        self.assertEqual(other.get("/api/orchestrator/conversation").json()["messages"], [])
        self.assertEqual(other.get("/api/onboarding").json()["step"], "assistant_name")
        self.assertNotEqual(user_file.user_path(other_account["id"]), user_file.user_path(self.account["id"]))
        self.assertEqual(TestClient(app).get("/api/onboarding").status_code, 401)


class OrchestratorChatTests(AccountFixture, unittest.TestCase):
    def add_member(self, account_id, project_id):
        with database.database() as db:
            db.execute("INSERT INTO project_members (project_id, account_id, role) VALUES (%s, %s, 'member')", (project_id, account_id))

    def test_prompt_has_user_md_and_only_the_projects_the_account_can_open(self):
        self.client.put("/api/orchestrator/profile", json={"name": "Rafa", "style": "Short"})
        self.client.post("/api/memory/entries", json={"target": "business", "fact": "The bakery opens at six in the morning."})
        self.client.post("/api/memory/entries", json={"target": "owner", "fact": "The owner prefers WhatsApp updates."})
        other = TestClient(app)
        other_account, other_project = self.switch_to_new_account("neighbour", other)
        other.post("/api/memory/entries", json={"target": "business", "fact": "The noodle stall sells mie ayam."})
        prompt = assistant.system_prompt(self.account["id"])
        self.assertIn("- Name: Rafa", prompt)
        self.assertIn("The bakery opens at six", prompt)
        self.assertIn("prefers WhatsApp", prompt)
        self.assertNotIn("mie ayam", prompt)
        # A teammate sees the shared project's business facts, never its owner's personal ones,
        # and never the owner's USER.md.
        self.add_member(other_account["id"], self.project["id"])
        shared = assistant.system_prompt(other_account["id"])
        self.assertIn("The bakery opens at six", shared)
        self.assertNotIn("prefers WhatsApp", shared)
        self.assertNotIn("Rafa", shared)
        self.assertIn("mie ayam", shared)

    def test_a_turn_runs_in_the_orchestrator_profile_with_its_personality(self):
        self.client.put("/api/orchestrator/personality", json={"language": "id"})
        chat = AsyncMock(return_value=("Halo! Ada yang bisa saya bantu?", False))
        with patch.object(runtime, "chat", chat):
            response = self.client.post("/api/orchestrator/chat", json={"message": "Halo"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["reply"], "Halo! Ada yang bisa saya bantu?")
        args, kwargs = chat.call_args
        self.assertEqual(args[4], assistant.AGENT_ID)
        # Its own profile, never a project's.
        self.assertEqual(kwargs["project_id"], assistant.scope_id(self.account["id"]))
        self.assertNotEqual(kwargs["project_id"], self.project["id"])
        self.assertIn("Bahasa Indonesia", kwargs["identity"])
        self.assertIn("Test business", args[0])
        messages = self.client.get("/api/orchestrator/conversation").json()["messages"]
        self.assertEqual([(message["role"], message["text"]) for message in messages],
                         [("user", "Halo"), ("assistant", "Halo! Ada yang bisa saya bantu?")])
        self.assertEqual(self.client.post("/api/orchestrator/chat", json={"message": "   "}).status_code, 422)

    def test_runtime_failures_are_reported(self):
        failing = AsyncMock(side_effect=runtime.HermesError("Mula's runtime is not reachable.", 503))
        with patch.object(runtime, "chat", failing):
            response = self.client.post("/api/orchestrator/chat", json={"message": "Hello"})
        self.assertEqual((response.status_code, response.json()["detail"]), (503, "Mula's runtime is not reachable."))

    def test_the_orchestrator_soul_survives_on_its_own_profile(self):
        self.client.put("/api/orchestrator/personality", json={"formality": "formal"})
        assistant.provision(self.account["id"])
        soul = (self.runtime_home / "profiles" / ("mula-" + assistant.scope_id(self.account["id"]).replace("-", "")) / "SOUL.md").read_text()
        self.assertIn("Formal and polite.", soul)
        self.assertIn("## Personality", soul)
        project_soul = (self.runtime_home / "profiles" / ("mula-" + self.project["id"].replace("-", "")) / "SOUL.md").read_text()
        self.assertNotIn("## Personality", project_soul)


if __name__ == "__main__":
    unittest.main()
