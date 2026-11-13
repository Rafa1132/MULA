# Forecasting (client)

`ForecastPanel` is the forecast runner shown in **My agents → Forecasting**. It uploads a sales or demand history, runs a statistical forecast on the server, and shows the chart, the table, error scores, and an optional explanation written by Qwen.

## Flow

1. **Upload a CSV**, using the same checks as the Operator attachment (`.csv`, UTF-8, ≤50 KB). Calls `POST /api/forecasting/preview` to get the column names.
2. **Choose inputs:** date column (`YYYY-MM-DD`), value column, frequency (daily / weekly / monthly), method (`auto` or a single method), horizon (1–90), moving-average window, smoothing alpha, and season length.
3. **Run:** `POST /api/forecasting/run` returns the report.
4. **Review:**
   - an SVG chart (solid line for history, dashed for the forecast), with exact values in the table
   - backtest MAE and RMSE per method
   - a plain description of the calculation
   - warnings
5. **Download forecast CSV** (`mula-forecast.csv`, built in the browser).
6. **Ask Forecasting to explain** (shown only when the `explain` tool is enabled): `POST /api/forecasting/explain` with `{ run_id }`. It runs on Forecasting's own brain.

When the panel opens, it loads the latest saved report and explanation from `GET /api/forecasting/latest`.

## Files

| File | Purpose |
|---|---|
| `components/ForecastPanel.tsx` | Panel, inputs, `ForecastChart` SVG, table, download, explain |
| `index.ts` | Exports `ForecastPanel` |

The proxy route is `src/app/api/forecasting/[action]/route.ts`. It allows POST for `preview`, `run` and `explain`, and GET for `latest`.

## Used by

`features/team` (`TeamPage.tsx`) embeds the panel in the Forecasting settings panel on My agents and disables it while agent settings have unsaved changes.

## Server counterpart

`server/src/features/forecasting`. See `docs/forecasting.md` for formulas and data requirements.
