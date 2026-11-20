"""Saved forecast reports, shared by the forecast runner and the Forecasting agent's tools.

Table `forecast_runs` is defined in server/migrations; `report` is a JSONB column and `seq`
an identity column that gives runs their order.
"""
from uuid import uuid4

from ..auth import accounts
from ...common.database import Jsonb

# Recent reports kept per account; the raw source CSV is never stored.
KEEP_RUNS = 20


def save_run(project_id, report):
    """Store a report under a new id, which is also set on the report, and drop old ones."""
    report["id"] = str(uuid4())
    with accounts.database() as db:
        db.execute("INSERT INTO forecast_runs (id, project_id, report) VALUES (%s, %s, %s)", (report["id"], project_id, Jsonb(report)))
        db.execute("DELETE FROM forecast_runs WHERE project_id = %s AND seq NOT IN (SELECT seq FROM forecast_runs WHERE project_id = %s ORDER BY seq DESC LIMIT %s)",
                   (project_id, project_id, KEEP_RUNS))
    return report


def latest_run(project_id):
    with accounts.database() as db:
        row = db.execute("SELECT report, explanation FROM forecast_runs WHERE project_id = %s ORDER BY seq DESC LIMIT 1", (project_id,)).fetchone()
    if row:
        return {"report": row["report"], "explanation": row["explanation"]}
    return {"report": None, "explanation": None}


def latest_run_since(project_id, epoch_seconds):
    """The newest report saved at or after `epoch_seconds`, or None.

    A request between agents uses this to attach the forecast its answering turn calculated
    (features/a2a). Runs are not tagged with the request that made them, so when two requests in
    one project run at the same time, both may carry the newer run; the text answer is always the
    request's own.
    """
    with accounts.database() as db:
        row = db.execute("SELECT report FROM forecast_runs WHERE project_id = %s AND created_at >= to_timestamp(%s) ORDER BY seq DESC LIMIT 1",
                         (project_id, epoch_seconds)).fetchone()
    if row is None:
        return None
    return row["report"]


def find_run(project_id, run_id):
    with accounts.database() as db:
        row = db.execute("SELECT report FROM forecast_runs WHERE project_id = %s AND id = %s", (project_id, run_id)).fetchone()
    if row is None:
        return None
    return row["report"]


def save_explanation(project_id, run_id, explanation):
    with accounts.database() as db:
        db.execute("UPDATE forecast_runs SET explanation = %s WHERE id = %s AND project_id = %s", (explanation, run_id, project_id))


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
