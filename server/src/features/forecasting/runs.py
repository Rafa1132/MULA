"""Saved forecast reports, shared by the forecast runner and the Forecasting agent's tools."""
import json
from uuid import uuid4

from ..auth import accounts

# Recent reports kept per account; the raw source CSV is never stored.
KEEP_RUNS = 20


def schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS forecast_runs (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
        report TEXT NOT NULL, explanation TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')


def save_run(account_id, report):
    """Store a report under a new id, which is also set on the report, and drop old ones."""
    report["id"] = str(uuid4())
    with accounts.database() as db:
        schema(db)
        db.execute("INSERT INTO forecast_runs (id, account_id, report) VALUES (?, ?, ?)", (report["id"], account_id, json.dumps(report)))
        db.execute("DELETE FROM forecast_runs WHERE account_id = ? AND id NOT IN (SELECT id FROM forecast_runs WHERE account_id = ? ORDER BY rowid DESC LIMIT ?)", (account_id, account_id, KEEP_RUNS))
    return report


def latest_run(account_id):
    with accounts.database() as db:
        schema(db)
        row = db.execute("SELECT report, explanation FROM forecast_runs WHERE account_id = ? ORDER BY rowid DESC LIMIT 1", (account_id,)).fetchone()
    if row:
        return {"report": json.loads(row["report"]), "explanation": row["explanation"]}
    return {"report": None, "explanation": None}


def find_run(account_id, run_id):
    with accounts.database() as db:
        schema(db)
        row = db.execute("SELECT report FROM forecast_runs WHERE account_id = ? AND id = ?", (account_id, run_id)).fetchone()
    if row is None:
        return None
    return json.loads(row["report"])


def save_explanation(account_id, run_id, explanation):
    with accounts.database() as db:
        db.execute("UPDATE forecast_runs SET explanation = ? WHERE id = ? AND account_id = ?", (explanation, run_id, account_id))


def summary_for_model(report):
    """A bounded copy of a report for a model's context; the chart and table keep everything."""
    summary = dict(report)
    summary["history_periods"] = len(report["history"])
    summary["forecast_horizon"] = len(report["forecast"])
    # Unused controls must not be mistaken for the selected method's parameters.
    summary.pop("parameters", None)
    summary["history"] = report["history"][-12:]
    summary["forecast"] = report["forecast"][:12]
    return summary
