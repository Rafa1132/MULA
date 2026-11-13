import json
import unittest

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from src.features.operator.csv_files import CsvFile, prepare_csv
from src.main import app
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response


class CsvParsingTests(unittest.TestCase):
    def test_bom_semicolon_quotes_and_exact_decimal_summaries(self):
        payload, note = prepare_csv(CsvFile(name="sales.csv", content='\ufeffitem;amount;note\n"Coffee; milk";0.1;"first\nline"\nTea;0.2;\n'))
        data = json.loads(payload)
        self.assertEqual(data["data_rows"], 2)
        self.assertEqual(data["rows"][0], ["Coffee; milk", "0.1", "first\nline"])
        self.assertEqual(data["numeric_summaries"]["amount"]["sum"], "0.3")
        self.assertEqual(data["missing_values"]["note"], 1)
        self.assertIn("2 rows", note)

    def test_plain_single_column_csv(self):
        payload, _ = prepare_csv(CsvFile(name="names.CSV", content="name\nRafa\nMula\n"))
        self.assertEqual(json.loads(payload)["rows"], [["Rafa"], ["Mula"]])

    def test_bad_data_and_limits_are_rejected(self):
        cases = [
            ("bad.txt", "a\n1"), ("../bad.csv", "a\n1"),
            ("\ud800.csv", "a\n1"),
            ("bad.csv", "a\n1\x00"), ("bad.csv", "a,b\n1"),
            ("bad.csv", "a,b\n\"unfinished"), ("bad.csv", "a,b\n"),
            ("bad.csv", "a\n" + "1\n" * 501),
            ("bad.csv", "a\n" + "語" * 18000),
            ("bad.csv", "a\n" + ("x" * 1000 + "\n") * 25),
        ]
        for name, content in cases:
            with self.subTest(name=name, preview=content[:30]), self.assertRaises((HTTPException, ValidationError)):
                prepare_csv(CsvFile(name=name, content=content))

    def test_blank_and_duplicate_headers_preserve_separate_column_totals(self):
        payload, note = prepare_csv(CsvFile(name="sales.csv", content="Product,Sales,Sales,\nCoffee,10,20,3\nTea,5,7,4\n"))
        data = json.loads(payload)
        self.assertEqual(data["columns"], ["Product", "Sales", "Sales (2)", "Column 4"])
        self.assertEqual(data["numeric_summaries"]["Sales"]["sum"], "15")
        self.assertEqual(data["numeric_summaries"]["Sales (2)"]["sum"], "27")
        self.assertEqual(data["numeric_summaries"]["Column 4"]["sum"], "7")
        self.assertIn("column 3 → Sales (2)", note)
        self.assertEqual(data["rows"][0], ["Coffee", "10", "20", "3"])

    def test_generated_headers_do_not_collide_with_existing_names(self):
        payload, _ = prepare_csv(CsvFile(name="names.csv", content=",Column 1,Sales,Sales,Sales (2)\na,b,1,2,3\n"))
        self.assertEqual(json.loads(payload)["columns"], ["Column 1 (2)", "Column 1", "Sales", "Sales (3)", "Sales (2)"])

    def test_all_blank_headers_are_kept_as_headers(self):
        payload, _ = prepare_csv(CsvFile(name="blank.csv", content=", ,\nCoffee,10,20\n"))
        data = json.loads(payload)
        self.assertEqual(data["columns"], ["Column 1", "Column 2", "Column 3"])
        self.assertEqual(data["data_rows"], 1)

    def test_unchanged_headers_have_no_adjustment_notice(self):
        payload, note = prepare_csv(CsvFile(name="normal.csv", content="name,amount\nCoffee,10\n"))
        self.assertEqual(json.loads(payload)["header_adjustments"], [])
        self.assertNotIn("Auto-named", note)

    def test_formulas_and_ambiguous_numbers_stay_text(self):
        payload, _ = prepare_csv(CsvFile(name="input.csv", content='formula,money\n=1+1,"1,000"\n=2+2,$3\n'))
        data = json.loads(payload)
        self.assertEqual(data["numeric_summaries"], {})
        self.assertEqual(data["rows"][0][0], "=1+1")


class CsvChatTests(AccountFixture, unittest.TestCase):
    def test_csv_reaches_runtime_and_metadata_survives_reload(self):
        requests = []

        def handler(request):
            requests.append(json.loads(request.content))
            return stream_response(answer("Total: 30"))

        with gateway(handler):
            response = self.client.post("/api/agents/operator/chat", json={
                "message": "What is the total?", "stream": True,
                "csv_file": {"name": "sales.csv", "content": "item,amount\nTea,10\nCoffee,20\n"},
            })
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual(events[-1]["type"], "done")
        self.assertEqual(events[1]["type"], "attachment")
        prompt = requests[0]["messages"][-1]["content"]
        self.assertIn('"sum": "30"', prompt)
        self.assertIn('"Coffee", "20"', prompt)
        self.assertNotIn("tools", requests[0])
        saved = self.client.get("/api/conversation").json()["messages"]
        self.assertEqual(saved[0]["text"], "What is the total?")
        self.assertIn("sales.csv · 2 rows · 2 columns", saved[0]["note"])

    def test_invalid_csv_does_not_save_messages_or_call_model(self):
        with gateway(lambda _: self.fail("Invalid CSV must not reach the model")):
            response = self.client.post("/api/agents/operator/chat", json={
                "message": "Analyze", "csv_file": {"name": "bad.csv", "content": "a,b\n1\n"},
            })
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/conversation").json()["messages"], [])

    def test_csv_still_requires_account(self):
        response = TestClient(app).post("/api/agents/operator/chat", json={
            "message": "Analyze", "csv_file": {"name": "sales.csv", "content": "a\n1\n"},
        })
        self.assertEqual(response.status_code, 401)

    def test_validation_does_not_echo_business_rows(self):
        response = self.client.post("/api/agents/operator/chat", json={
            "message": "Analyze", "csv_file": {"name": "sales.csv", "content": "PRIVATE", "other": "secret"},
        })
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("PRIVATE", response.text)
