import json
import unittest
from datetime import date, timedelta
from unittest.mock import patch
from fastapi import HTTPException
from src.features.forecasting.service import ForecastRequest, METHODS, forecast, predict
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response


def request(values=None, **options):
    if values is None:
        values = list(range(10, 40))
    rows = [f"{date(2026, 1, 1) + timedelta(days=index)},{value}" for index, value in enumerate(values)]
    return {"csv_file": {"name": "sales.csv", "content": "date,sales\n" + "\n".join(rows)}, "date_column": "date", "value_column": "sales", **options}


class ForecastMathTests(unittest.TestCase):
    def test_known_method_values(self):
        expected = {"naive": [40, 40, 40], "moving_average": [30, 30, 30], "exponential_smoothing": [31.25] * 3, "seasonal_naive": [30, 40, 30], "drift": [50, 60, 70]}
        for method, result in expected.items():
            self.assertEqual(predict([10, 20, 30, 40], method, 3, 3, .5, 2), result)

    def test_auto_finds_trend_and_scores_out_of_sample(self):
        result = forecast(ForecastRequest(**request()), METHODS)
        self.assertEqual(result["method"], "drift")
        self.assertEqual(result["forecast"][0], {"date": "2026-01-31", "value": 40})
        scores = {row["method"]: row["mae"] for row in result["scores"]}
        self.assertEqual(scores["drift"], 0)
        self.assertEqual(scores["naive"], 1)
        self.assertEqual(result["backtest_periods"], 6)

    def test_seasonal_zero_and_negative_values(self):
        values = [0, 20, 5, 30, 2, 100, 4] * 6
        result = forecast(ForecastRequest(**request(values, season_length=7)), METHODS)
        self.assertEqual(result["method"], "seasonal_naive")
        self.assertEqual([row["value"] for row in result["forecast"]], values[:7])
        zero = forecast(ForecastRequest(**request([0] * 12)), METHODS)
        self.assertEqual(zero["method"], "naive")
        self.assertTrue(all(row["mae"] == 0 for row in zero["scores"]))
        negative = forecast(ForecastRequest(**request(list(range(6, 0, -1)), method="drift")), METHODS)
        self.assertTrue(any("negative" in warning for warning in negative["warnings"]))

    def test_backtest_does_not_peek_at_target(self):
        result = forecast(ForecastRequest(**request([10] * 9 + [100], method="naive")), METHODS)
        score = next(row for row in result["scores"] if row["method"] == "naive")
        self.assertEqual(score["mae"], 30)
        self.assertEqual(result["forecast"][0]["value"], 100)

    def test_month_end_and_sorted_rows(self):
        value = request(method="naive", frequency="monthly", horizon=2)
        value["csv_file"]["content"] = "date,sales\n2026-06-30,6\n2026-05-31,5\n2026-04-30,4\n2026-03-31,3\n2026-02-28,2\n2026-01-31,1"
        result = forecast(ForecastRequest(**value), METHODS)
        self.assertEqual([row["date"] for row in result["forecast"]], ["2026-07-31", "2026-08-31"])
        self.assertIn("Rows were sorted by date before forecasting.", result["warnings"])

    def test_invalid_series_and_insufficient_history(self):
        for old, new in [("2026-01-02", "2026-01-01"), ("2026-01-02", "2026-03-02"), ("2026-01-02", "02/01/2026"), (",11", ",NaN"), (",11", ","), (",11", ",1000000000001")]:
            payload = request()
            payload["csv_file"]["content"] = payload["csv_file"]["content"].replace(old, new)
            with self.subTest(new=new), self.assertRaises(HTTPException):
                forecast(ForecastRequest(**payload), METHODS)
        for payload in [request([1] * 5), request([1] * 6, method="seasonal_naive"), request(value_column="absent"), request(value_column="date")]:
            with self.assertRaises(HTTPException):
                forecast(ForecastRequest(**payload), METHODS)

    def test_disabled_methods(self):
        with self.assertRaises(HTTPException) as error:
            forecast(ForecastRequest(**request(method="drift")), ["naive"])
        self.assertEqual(error.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            forecast(ForecastRequest(**request()), ["explain"])
        result = forecast(ForecastRequest(**request()), ["naive"])
        self.assertEqual(result["method"], "naive")
        self.assertEqual(len(result["scores"]), 1)


class ForecastApiTests(AccountFixture, unittest.TestCase):
    def test_run_persists_and_requires_no_llm(self):
        with patch("src.features.operator.runtime.httpx.AsyncClient") as client:
            response = self.client.post("/api/forecasting/run", json=request())
            self.assertEqual(response.status_code, 200, response.text)
            client.assert_not_called()
        self.assertEqual(self.client.get("/api/forecasting/latest").json()["report"], response.json())

    def test_auth_and_account_isolation(self):
        report = self.client.post("/api/forecasting/run", json=request()).json()
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.post("/api/forecasting/run", json=request()).status_code, 401)
        self.client.post("/api/auth/signup", json={"username": "other", "password": "long-password-123"})
        self.assertIsNone(self.client.get("/api/forecasting/latest").json()["report"])
        self.assertEqual(self.client.post("/api/forecasting/explain", json={"run_id": report["id"]}).status_code, 404)

    def test_explanation_uses_saved_report_and_config_in_isolated_session(self):
        report = self.client.post("/api/forecasting/run", json=request()).json()
        self.client.put("/api/team/forecasting", json={"prompt": "Explain in Indonesian", "data": "Currency: IDR", "tools": ["naive", "explain"], "revision": 0})
        captured = []
        def handler(req):
            captured.append(req)
            return stream_response(answer("Here is the forecast."))
        with gateway(handler):
            result = self.client.post("/api/forecasting/explain", json={"run_id": report["id"]})
        self.assertEqual(result.status_code, 200, result.text)
        payload = json.loads(captured[0].content)
        self.assertIn("Explain in Indonesian", payload["messages"][0]["content"])
        self.assertIn("Currency: IDR", payload["messages"][0]["content"])
        self.assertIn(report["id"], payload["messages"][1]["content"])
        supplied_report = json.loads(payload["messages"][1]["content"].split("\n", 1)[1])
        self.assertEqual(supplied_report["history_periods"], 30)
        self.assertIn("Use all 30 observations", supplied_report["method_description"])
        self.assertNotIn("parameters", supplied_report)
        self.assertNotIn(self.account["conversation_id"], captured[0].headers["X-Hermes-Session-Id"])
        self.assertEqual(self.client.get("/api/forecasting/latest").json()["explanation"], "Here is the forecast.")
        self.assertEqual(self.client.get("/api/conversation").json()["messages"], [])

    def test_preview_and_invalid_input_do_not_echo_data(self):
        response = self.client.post("/api/forecasting/preview", json={"name": "sales.csv", "content": ",sales,sales\n2026-01-01,1,2"})
        self.assertEqual(response.json()["columns"], ["Column 1", "sales", "sales (2)"])
        payload = request(horizon=1000)
        payload["csv_file"]["content"] += "\nprivate-sensitive-data"
        response = self.client.post("/api/forecasting/run", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("private-sensitive-data", response.text)

    def test_tool_permissions_enforced_for_run_and_explain(self):
        report = self.client.post("/api/forecasting/run", json=request()).json()
        self.client.put("/api/team/forecasting", json={"prompt": "", "data": "", "tools": ["naive"], "revision": 0})
        self.assertEqual(self.client.post("/api/forecasting/run", json=request(method="drift")).status_code, 403)
        self.assertEqual(self.client.post("/api/forecasting/explain", json={"run_id": report["id"]}).status_code, 403)

    def test_retention_is_bounded(self):
        from src.features.auth import accounts
        for _ in range(22):
            self.assertEqual(self.client.post("/api/forecasting/run", json=request()).status_code, 200)
        with accounts.database() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM forecast_runs").fetchone()[0], 20)
