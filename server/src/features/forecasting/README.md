# Forecasting (server)

The Forecasting specialist, a Mula agent with its own persona (`server/agents/forecasting.md`) and brain. Its numbers come from small, deterministic statistical methods written in plain Python, with no model training and no generated code. The agent runs them through its `calculate_forecast` tool (`features/agents`) or the "Run a forecast" panel, and explains the results in words; it never makes numbers up.

## Methods (`service.py`)

| Tool | Forecast |
|---|---|
| `naive` | Repeat the last value |
| `moving_average` | Repeat the mean of the last `window` values (2–60) |
| `exponential_smoothing` | Simple exponential smoothing with `alpha` (0–1], then repeat the final level |
| `seasonal_naive` | Repeat the last `season_length` values (2–60) |
| `drift` | Last value + step × (last − first) / (n − 1) |

**Auto mode** compares every enabled method that has enough history. Each one is tested on the same recent periods, using only the data before each period (an expanding-window, one-step backtest over `min(20, max(3, n/5))` periods). Auto picks the method with the lowest MAE, and the report includes both MAE and RMSE.

**Input requirements:**
- Dates must be `YYYY-MM-DD` and regular for the chosen frequency (daily, weekly or monthly).
- At least six periods.
- Seasonal repeat needs two full cycles before the test periods.
- Missing periods, duplicates and ambiguous numbers are rejected rather than guessed.

Warnings cover external factors that aren't modelled, horizons longer than the backtest, negative forecasts (which aren't clipped), and methods skipped for lack of history.

## Endpoints (`routes.py`)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/forecasting/preview` | `CsvFile` → `{ columns, rows, note }`, using the Operator's `prepare_csv` |
| POST | `/api/forecasting/run` | `ForecastRequest` → report, saved with a new UUID |
| GET | `/api/forecasting/latest` | Latest `{ report, explanation }` for the account |
| POST | `/api/forecasting/explain` | `{ run_id }` → `{ explanation }`; requires the `explain` tool |

Choosing a method that's disabled in My agents returns 403. Running auto with no usable methods returns 422.

## Explanation

- **Ask Forecasting to explain** is a Forecasting turn on the agent's own brain (`agents.answer_as`), with its persona plus the owner's instructions and reference data from `team.context`. The persona forbids inventing numbers, claiming ML training, or giving confidence intervals.
- The report sent to the model (`runs.summary_for_model`) is shortened to the last 12 history points and the first 12 forecast points, with the history and horizon lengths, and the unused parameter controls removed. The `calculate_forecast` tool returns the same summary.
- Each explanation runs in **its own throwaway Mula session**, `uuid5(account_id, "forecasting:" + uuid4())`, so it never mixes with the Operator chat, the direct Forecasting chat or earlier explanations.

## Storage

`forecast_runs(seq, id, project_id, report JSONB, explanation, created_at)` in the PostgreSQL application database; `seq` orders the runs. Only the **last 20 runs per account** are kept. The report includes the selected date/value history; the original CSV isn't stored.

## Files

`service.py` (methods), `runs.py` (saved runs and the model summary), `routes.py`, `tests/test_forecasting.py`. See also `docs/forecasting.md`.

## Limits

- No prediction intervals, external factors, ML models or multi-series forecasts.
- The Operator asks Forecasting through `ask_agent`, by default only after the owner approves (see `features/agents`).
