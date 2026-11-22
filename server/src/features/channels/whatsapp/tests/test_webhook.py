import asyncio
import hashlib
import hmac
import json
import logging
import time
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from src.main import app  # first: the app import settles the features' import order
from src.common import config
from src.features.auth import accounts
from src.features.channels.whatsapp import graph
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response

NUMBER_A, NUMBER_B = "1000000001", "1000000002"
TOKEN = "EAAGtesttoken" + "x" * 30
APP_SECRET = "appsecret" + "s" * 23
CUSTOMER = "6281234567890"


class CapturedLogs(logging.Handler):
    def __init__(self):
        super().__init__(logging.DEBUG)
        self.lines = []

    def emit(self, record):
        self.lines.append(record.getMessage())


class WebhookFixture(AccountFixture):
    """A project with a connected (fake) WhatsApp number. Graph answers from `self.graph_answers`
    through a mock transport; every request it gets is kept in `self.graph_calls`."""

    def setUp(self):
        super().setUp()
        self.patch(config, "MULA_SECRET_KEY", "ab" * 32)
        self.patch(config, "MULA_PUBLIC_URL", "https://mula.test")
        self.graph_calls, self.graph_answers, self.sleeps = [], [], []

        def handler(request):
            self.graph_calls.append(request)
            if self.graph_answers:
                return self.graph_answers.pop(0)
            return httpx.Response(200, json={"messages": [{"id": f"wamid.out{len(self.graph_calls)}"}]})

        async def no_wait(seconds):
            self.sleeps.append(seconds)

        self.patch(graph, "_transport", httpx.MockTransport(handler))
        self.patch(graph, "_sleep", no_wait)
        self.logs = CapturedLogs()
        logging.getLogger().addHandler(self.logs)
        self.addCleanup(logging.getLogger().removeHandler, self.logs)
        self.connection = self.connect(self.client, NUMBER_A, APP_SECRET)

    def patch(self, target, name, value):
        patcher = patch.object(target, name, value)
        patcher.start()
        self.addCleanup(patcher.stop)

    def connect(self, client, number, app_secret):
        response = client.put("/api/channels/whatsapp", json={"phone_number_id": number, "waba_id": "2000000001",
                                                               "access_token": TOKEN, "app_secret": app_secret,
                                                               "reopen_template": "hello_again", "reopen_language": "en_US"})
        self.assertEqual(response.status_code, 200, response.text)
        status = response.json()
        status["id"] = status["webhook_url"].rsplit("/", 1)[-1]
        return status

    def add_customer_service(self, client=None):
        client = client or self.client
        response = client.post("/api/team/templates/customer_service",
                               json={"prompt": "", "tools": ["knowledge_read", "handoff"], "brain": "qwen",
                                     "support": {"tone": "friendly", "whatsapp_enabled": True}})
        self.assertEqual(response.status_code, 201, response.text)
        entry = client.post("/api/knowledge", json={"kind": "hours", "title": "Opening hours", "body": "Open 08:00 to 17:00."})
        self.assertEqual(entry.status_code, 201, entry.text)

    def payload(self, text="When are you open?", number=NUMBER_A, message_id="wamid.in1", sender=CUSTOMER):
        return {"object": "whatsapp_business_account", "entry": [{"id": "2000000001", "changes": [{"field": "messages", "value": {
            "messaging_product": "whatsapp", "metadata": {"display_phone_number": "62800", "phone_number_id": number},
            "contacts": [{"profile": {"name": "Budi"}, "wa_id": sender}],
            "messages": [{"from": sender, "id": message_id, "timestamp": str(int(time.time())), "type": "text", "text": {"body": text}}]}}]}]}

    def post(self, payload, connection=None, secret=APP_SECRET, signature=None):
        connection = connection or self.connection
        body = json.dumps(payload).encode()
        headers = {"content-type": "application/json"}
        if signature is None:
            signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if signature:
            headers["x-hub-signature-256"] = signature
        return self.client.post(f"/api/channels/whatsapp/webhook/{connection['id']}", content=body, headers=headers)

    def messages(self, project_id=None):
        with accounts.database() as db:
            return db.execute("""SELECT m.* FROM support_messages m JOIN support_conversations c ON c.id = m.conversation_id
                                 WHERE c.project_id = %s ORDER BY m.id""", (project_id or self.project["id"],)).fetchall()

    def sends(self):
        return [json.loads(call.content) for call in self.graph_calls if call.url.path.endswith("/messages")]


class VerificationTests(WebhookFixture, unittest.TestCase):
    def verify(self, token, mode="subscribe", connection_id=None):
        return self.client.get(f"/api/channels/whatsapp/webhook/{connection_id or self.connection['id']}",
                               params={"hub.mode": mode, "hub.verify_token": token, "hub.challenge": "8675309"})

    def test_the_right_verify_token_echoes_the_challenge(self):
        response = self.verify(self.connection["verify_token"])
        self.assertEqual((response.status_code, response.text), (200, "8675309"))
        self.assertIsNotNone(self.client.get("/api/channels/whatsapp").json()["verified_at"])

    def test_a_wrong_token_mode_or_connection_is_refused_alike(self):
        self.assertEqual(self.verify("wrong").status_code, 403)
        self.assertEqual(self.verify(self.connection["verify_token"], mode="unsubscribe").status_code, 403)
        self.assertEqual(self.verify(self.connection["verify_token"], connection_id="0" * 32).status_code, 403)
        self.assertEqual(self.verify(self.connection["verify_token"], connection_id="not-a-uuid").status_code, 403)
        self.assertIsNone(self.client.get("/api/channels/whatsapp").json()["verified_at"])


class ReceiveTests(WebhookFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.add_customer_service()

    def model(self, text):
        return gateway(lambda request: stream_response(answer(text)))

    def test_a_signed_message_is_answered_on_whatsapp(self):
        with self.model("We're open 08:00 to 17:00."):
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 200)
        sent = self.sends()
        self.assertEqual(len(sent), 1)
        self.assertEqual((sent[0]["to"], sent[0]["text"]["body"]), (CUSTOMER, "We're open 08:00 to 17:00."))
        self.assertEqual(self.graph_calls[0].url.path, f"/{config.MULA_WHATSAPP_GRAPH_VERSION}/{NUMBER_A}/messages")
        self.assertEqual(self.graph_calls[0].headers["authorization"], f"Bearer {TOKEN}")
        self.assertEqual([(row["direction"], row["status"]) for row in self.messages()], [("in", "received"), ("out", "sent")])

    def test_a_bad_or_missing_signature_is_rejected_before_parsing(self):
        for signature in ["sha256=" + "0" * 64, "", "md5=abc"]:
            with self.subTest(signature=signature):
                self.assertEqual(self.post(self.payload(), signature=signature).status_code, 401)
        self.assertEqual(self.post(self.payload(), secret="another-apps-secret").status_code, 401)
        self.assertEqual(self.messages(), [])
        self.assertEqual(self.client.post("/api/channels/whatsapp/webhook/" + "0" * 32, content=b"{}").status_code, 404)

    def test_a_retried_delivery_is_processed_once(self):
        with self.model("We're open 08:00 to 17:00."):
            self.assertEqual(self.post(self.payload()).status_code, 200)
            self.assertEqual(self.post(self.payload()).status_code, 200)
        self.assertEqual(len([row for row in self.messages() if row["direction"] == "in"]), 1)
        self.assertEqual(len(self.sends()), 1)

    def test_messages_reach_only_the_workspace_that_owns_the_number(self):
        other = TestClient(app, cookies=self.client.cookies)
        second = self.open_new_project(other, "Second shop")
        connection_b = self.connect(other, NUMBER_B, "other" + "z" * 27)
        self.assertEqual(other.put("/api/channels/whatsapp", json={"phone_number_id": NUMBER_A, "waba_id": "2000000001",
                                                                    "access_token": TOKEN, "app_secret": APP_SECRET}).status_code, 409)
        with self.model("We're open 08:00 to 17:00."):
            self.post(self.payload())
            # Signed with A's secret on A's URL, but for B's number: ignored, never delivered to B.
            self.post(self.payload(number=NUMBER_B, message_id="wamid.in2"))
        self.assertEqual(len(self.messages()), 2)
        self.assertEqual(self.messages(second["id"]), [])
        # B's URL checks B's secret.
        self.assertEqual(self.post(self.payload(number=NUMBER_B, message_id="wamid.in3"), connection=connection_b).status_code, 401)

    def test_delivery_statuses_are_recorded_without_text(self):
        with self.model("We're open 08:00 to 17:00."):
            self.post(self.payload())
        outbound = self.messages()[-1]
        status = {"object": "whatsapp_business_account", "entry": [{"changes": [{"field": "messages", "value": {
            "metadata": {"phone_number_id": NUMBER_A},
            "statuses": [{"id": outbound["external_id"], "status": "failed", "errors": [{"code": 131047, "title": "Re-engagement message"}]}]}}]}]}
        self.assertEqual(self.post(status).status_code, 200)
        row = self.messages()[-1]
        self.assertEqual((row["status"], row["error"]), ("failed", "Re-engagement message"))

    def test_media_is_stored_and_answered_with_a_text_only_note(self):
        payload = self.payload()
        payload["entry"][0]["changes"][0]["value"]["messages"][0] = {"from": CUSTOMER, "id": "wamid.img", "type": "image", "image": {"id": "1"}}
        with self.model("unused"):
            self.post(payload)
        self.assertEqual(self.messages()[0]["body"], "[image message]")
        self.assertIn("text messages", self.sends()[0]["text"]["body"])

    def test_secrets_are_never_returned_or_logged(self):
        with self.model("We're open 08:00 to 17:00."):
            self.post(self.payload())
        self.graph_answers.append(httpx.Response(401, json={"error": {"code": 190, "message": "Invalid OAuth access token"}}))
        checked = self.client.post("/api/channels/whatsapp/check").json()
        self.assertFalse(checked["ok"])
        status = self.client.get("/api/channels/whatsapp")
        bad = self.client.put("/api/channels/whatsapp", json={"phone_number_id": "12", "waba_id": "x", "access_token": TOKEN + " bad", "app_secret": APP_SECRET})
        self.assertEqual(bad.status_code, 422)
        for text in [status.text, bad.text, json.dumps(checked), "\n".join(self.logs.lines)]:
            self.assertNotIn(TOKEN, text)
            self.assertNotIn(APP_SECRET, text)
        self.assertEqual((status.json()["access_token"], status.json()["app_secret"]), ("set", "set"))
        # The customer's words aren't logged either.
        self.assertNotIn("When are you open?", "\n".join(self.logs.lines))

    def test_disconnect_forgets_the_number_and_keeps_the_inbox(self):
        # An invented amount is blocked by the grounding guard and becomes a ticket.
        with self.model("Your refund of Rp 50.000 is approved."):
            self.post(self.payload(text="I want a refund"))
        self.assertEqual(self.client.delete("/api/channels/whatsapp").status_code, 204)
        self.assertFalse(self.client.get("/api/channels/whatsapp").json()["connected"])
        self.assertEqual(self.post(self.payload(message_id="wamid.in9")).status_code, 404)
        self.assertEqual(len(self.client.get("/api/support/tickets").json()["tickets"]), 1)


class TemplateWindowTests(WebhookFixture, unittest.TestCase):
    def test_outside_the_window_only_the_template_is_sent(self):
        self.add_customer_service()
        with gateway(lambda request: stream_response(answer("A person will call you at 14:30."))):
            self.post(self.payload(text="Can I talk to someone?"))
        ticket = self.client.get("/api/support/tickets").json()["tickets"][0]
        with accounts.database() as db:
            db.execute("UPDATE support_conversations SET last_inbound_at = last_inbound_at - 90000 WHERE id = %s", (ticket["conversation_id"],))
        before = len(self.sends())
        self.assertEqual(self.client.post(f"/api/support/conversations/{ticket['conversation_id']}/reply", json={"text": "Hi"}).status_code, 409)
        self.assertEqual(len(self.sends()), before)
        self.assertEqual(self.client.post(f"/api/support/conversations/{ticket['conversation_id']}/template").status_code, 200)
        template = self.sends()[-1]
        self.assertEqual((template["type"], template["template"]["name"], template["template"]["language"]["code"]),
                         ("template", "hello_again", "en_US"))


class GraphRetryTests(WebhookFixture, unittest.TestCase):
    def send(self):
        return asyncio.run(graph.send_text(NUMBER_A, TOKEN, CUSTOMER, "Hello"))

    def test_server_errors_and_429_are_retried_with_backoff(self):
        self.graph_answers.extend([httpx.Response(503), httpx.Response(429, headers={"retry-after": "7"})])
        self.assertEqual(self.send(), "wamid.out3")
        self.assertEqual(self.sleeps, [1, 7])

    def test_retries_stop_after_the_last_backoff(self):
        self.graph_answers.extend([httpx.Response(500)] * 4)
        with self.assertRaises(graph.GraphError):
            self.send()
        self.assertEqual((len(self.graph_calls), self.sleeps), (4, [1, 2, 4]))

    def test_a_client_error_is_not_retried(self):
        self.graph_answers.append(httpx.Response(400, json={"error": {"code": 100, "message": "Invalid parameter"}}))
        with self.assertRaises(graph.GraphError) as raised:
            self.send()
        self.assertEqual((raised.exception.message, len(self.graph_calls), self.sleeps), ("Invalid parameter", 1, []))

    def test_a_huge_retry_after_is_capped(self):
        self.graph_answers.append(httpx.Response(429, headers={"retry-after": "3600"}))
        self.send()
        self.assertEqual(self.sleeps, [graph.MAX_RETRY_AFTER_SECONDS])


class NoKeyTests(AccountFixture, unittest.TestCase):
    def test_connecting_without_a_secret_key_explains_what_to_do(self):
        with patch.object(config, "MULA_SECRET_KEY", ""):
            response = self.client.put("/api/channels/whatsapp", json={"phone_number_id": NUMBER_A, "waba_id": "2000000001",
                                                                       "access_token": TOKEN, "app_secret": APP_SECRET})
            self.assertEqual(response.status_code, 503)
            self.assertIn("MULA_SECRET_KEY", response.json()["detail"])
            self.assertFalse(self.client.get("/api/channels/whatsapp").json()["secrets_ready"])


if __name__ == "__main__":
    unittest.main()
