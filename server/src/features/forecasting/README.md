# Forecasting (server)

The Forecasting specialist. Its forecasts come from small, deterministic statistical methods written in plain Python, with no model training and no generated code. Qwen is used only to explain a report that has already been calculated.

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

Choosing a method that's disabled in My team returns 403. Running auto with no usable methods returns 422.

## Explanation

- The prompt is the fixed `PROMPT` plus the owner's instructions and reference data from `team.context`. It forbids inventing numbers, claiming ML training, or giving confidence intervals.
- The report sent to the model is shortened to 12 history points and 12 forecast points, and the unused parameter controls are removed.
- Each explanation runs in **its own throwaway Hermes session**, `uuid5(account_id, "forecasting:" + uuid4())`, so it never mixes with the Operator chat or with earlier explanations. It uses `operator.runtime.chat()`.

## Storage

`forecast_runs(id, account_id, report JSON, explanation, created_at)` in `accounts.sqlite3`. Only the **last 20 runs per account** are kept. The report includes the selected date/value history; the original CSV isn't stored.

## Files

`service.py`, `routes.py`, `tests/test_forecasting.py`. See also `docs/forecasting.md`.

## Limits

- No prediction intervals, external factors, ML models or multi-series forecasts.
- The Operator can't call Forecasting yet; it can only point the user to My team.
