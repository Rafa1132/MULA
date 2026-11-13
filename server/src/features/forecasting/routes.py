import json
from uuid import UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from ..agents import service as agents
from ..auth import accounts
from ..operator.csv_files import CsvFile, prepare_csv
from ..operator.runtime import HermesError
from ..team import service as team
from . import runs
from .service import ForecastRequest, forecast

router = APIRouter()


@router.post("/api/forecasting/preview")
def preview(file: CsvFile, account: dict = Depends(accounts.current_account)):
    payload, note = prepare_csv(file)
    parsed = json.loads(payload)
    return {"columns": parsed["columns"], "rows": parsed["data_rows"], "note": note}


@router.post("/api/forecasting/run")
def run(request: ForecastRequest, account: dict = Depends(accounts.current_account)):
    config = team.settings(account["id"], "forecasting")
    return runs.save_run(account["id"], forecast(request, config["tools"]))


@router.get("/api/forecasting/latest")
def latest(account: dict = Depends(accounts.current_account)):
    return runs.latest_run(account["id"])


class ExplainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: UUID


@router.post("/api/forecasting/explain")
async def explain(request: ExplainRequest, account: dict = Depends(accounts.current_account)):
    config = team.settings(account["id"], "forecasting")
    team.require_tool(config, "explain")
    report = runs.find_run(account["id"], str(request.run_id))
    if report is None:
        raise HTTPException(404, "This forecast was not found in your account.")
    message = "Explain this calculated report. History and forecast lists show at most 12 points each:\n" + json.dumps(runs.summary_for_model(report))
    # A unique session isolates each explanation from the Operator's history and
    # from earlier explanations written under different settings.
    session = uuid5(UUID(account["id"]), "forecasting:" + str(uuid4()))
    try:
        reply, truncated = await agents.answer_as(account["id"], "forecasting", message, session, depth=1, include_csv=False)
    except HermesError as error:
        raise HTTPException(error.status_code, str(error)) from error
    if truncated:
        reply += "\n\n[Explanation reached its length limit.]"
    runs.save_explanation(account["id"], str(request.run_id), reply)
    return {"explanation": reply}
