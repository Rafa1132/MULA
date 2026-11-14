# Forecasting and agent settings

Open **My agents** and click the Operator or Forecasting card. Only implemented agents appear. Instructions (4,000 characters) and reference data (8,000 characters) are saved for that agent in your account. They augment built-in role instructions and are included in the next model request. They cannot grant unavailable capabilities. Save before running a forecast. Configurations have revision checks; reload the page if another tab has saved newer settings.

Operator's switches control new CSV ingestion, memory retrieval, and explicit `/remember` writes. They do not delete earlier messages, runtime history or saved facts. Reference data is separate from the categorized Memory files. Forecasting does not automatically retrieve Operator memories or conversation history.

## Run a forecast

1. Select **Forecasting → Run a forecast** and upload a CSV.
2. Select the date column, metric column and daily/weekly/monthly frequency.
3. Choose the horizon (1–90 periods), method and applicable numerical parameters.
4. Run, inspect historical error scores and warnings, then download forecast values if needed.
5. Optionally select **Ask Forecasting to explain**. Forecasting's brain interprets the existing report; calculations do not require the model.

You can also ask in words: in **My agents → Forecasting → Chat**, or through the Operator, which asks Forecasting after your approval by default. With a CSV attached, Forecasting runs the same calculation through its `calculate_forecast` tool and saves the run here.

The CSV follows the existing parser limits: UTF-8, 50 KB, 500 rows, 40 columns, 2,000 characters/cell and a 24,000-character prepared payload. Blank/duplicate column names are normalized and shown in the selectors. There must be at least six observations, one numeric total per date, and no missing periods. Date format is `YYYY-MM-DD`; rows are sorted chronologically with a notice. Duplicate dates must be aggregated before upload. Blank/ambiguous values, NaN/infinity and values outside ±1 trillion are rejected. Zero and negative values are valid and are not silently replaced or clipped. Other CSV columns are ignored by forecasting after parsing.

Daily/weekly steps are consecutive calendar days/seven-day intervals. Monthly dates are anchored on the first observation's day, clamped at month end (e.g. Jan 31 → Feb 28 → Mar 31). Trading-day calendars, automatic gap filling, product grouping and currency parsing are not implemented.

## Statistical methods

For history `y[1] … y[T]` and horizon `h`:

- **Last value:** every future value is `y[T]`.
- **Moving average:** every future value is the mean of the last `window` actual observations. Predictions are not recursively fed into the window.
- **Simple exponential smoothing:** initialize the level at `y[1]`, then update `level = alpha*y[t] + (1-alpha)*level`. Forecast the final level at every horizon. Alpha is chosen by the user, not fitted automatically.
- **Seasonal repeat:** repeat the final `season_length` observed values in order. Require two full cycles in the initial backtest training slice.
- **Trend (drift):** `y[T] + h*(y[T]-y[1])/(T-1)`. This extrapolates the average change and can overshoot or become negative.

Baseline and smoothing definitions follow [Forecasting: Principles and Practice — simple methods](https://otexts.com/fpp3/simple-methods.html) and [simple exponential smoothing](https://otexts.com/fpp3/ses.html). No ML/DL packages, model training, external forecasting API or new dependency is used.

## Comparison and limits

Hold out `min(20, max(3, floor(T/5)))` terminal periods as expanding-window one-step test origins. At each origin the algorithm sees only preceding observations. All compared methods use identical target dates; methods lacking sufficient initial history are skipped with a notice. Explicitly choosing an unavailable or data-insufficient method fails with an explanation. Automatic mode chooses the lowest mean absolute error (MAE), with stable ties favoring the earlier simpler baseline. RMSE is also shown. Parameters are not tuned on the test targets.

These scores are selection diagnostics, not an independent final evaluation. They measure one-step prediction errors in the original units, not percentage accuracy, confidence intervals or long-horizon performance. No uncertainty bands are fabricated. External drivers, holidays, promotions and stockouts are not modeled. Results are a baseline for planning; future accuracy is not guaranteed.

Prompt/reference changes guide how Forecasting talks and explains only. They do not alter the selected time series, numerical parameters or forecast output. Each explanation is isolated from the main Operator chat and uses the saved report loaded by the server (up to 12 history points and the first 12 forecasts plus scores/parameters/warnings). Model-written explanation text should be interpreted against the authoritative report/table.

## Storage and API

Both tables live in the PostgreSQL application database (`MULA_DATABASE_URL`, see `server/README.md`, "Database"). `agent_settings` is keyed by account/agent; `forecast_runs` contains account-owned reports and their latest explanation. Latest 20 reports per account are retained. A report includes selected historical dates/values, future estimates, parameters and scores. Original uploaded files and unused CSV columns are not retained. These reports are not automatically added to RAG memory.

Authenticated endpoints:

- `GET /api/team`, `PUT /api/team/{operator|forecasting}`.
- `POST /api/forecasting/preview`, `/run`, `/explain`.
- `GET /api/forecasting/latest`.

Read-only inspection:

```sh
psql "$(grep ^MULA_DATABASE_URL= server/.env.hermes | cut -d= -f2-)"
```

```sql
\d agent_settings
\d forecast_runs
SELECT agent_id, revision FROM agent_settings;
SELECT id, created_at FROM forecast_runs ORDER BY seq DESC LIMIT 20;
```

Tables are created by the migrations in `server/migrations` when the backend starts. Avoid manually changing the database while the server is running. Restart the backend after upgrading; a process already on port 8000 does not reload Python code automatically.
