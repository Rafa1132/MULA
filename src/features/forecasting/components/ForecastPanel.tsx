"use client";

import { useEffect, useRef, useState } from "react";
import { readCsvFile, CsvFile } from "@/features/operator/services/csv";
import { Agent, teamRequest } from "@/features/team/services/team";

type Point = { date: string; value: number };
type Report = {
  id: string; method: string; method_description: string; metric: string; filename: string; frequency: string;
  history: Point[]; forecast: Point[];
  scores: { method: string; mae: number; rmse: number }[];
  parameters: { window: number; alpha: number; season_length: number };
  backtest_periods: number; backtest_start: string; warnings: string[];
};
const names: Record<string, string> = { naive: "Last value", moving_average: "Moving average", exponential_smoothing: "Exponential smoothing", seasonal_naive: "Seasonal repeat", drift: "Trend (drift)" };
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function ForecastChart({ report }: { report: Report }) {
  const points = [...report.history, ...report.forecast];
  const low = Math.min(...points.map((point) => point.value));
  const high = Math.max(...points.map((point) => point.value));
  const range = Math.max(high - low, 1);
  const x = (index: number) => 70 + index / Math.max(points.length - 1, 1) * 490;
  const y = (value: number) => 190 - (value - low) / range * 150;
  const history = report.history.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const future = [report.history[report.history.length - 1], ...report.forecast].map((point, index) => `${x(report.history.length - 1 + index)},${y(point.value)}`).join(" ");
  return <><svg className="forecast-chart" viewBox="0 0 600 240" role="img" aria-label={`${report.metric}: historical values and ${report.forecast.length} forecast periods. Exact forecast values are in the table below.`}>
    <line className="chart-axis" x1="70" y1="190" x2="560" y2="190" />
    <line className="chart-divider" x1={x(report.history.length - 1)} y1="25" x2={x(report.history.length - 1)} y2="195" strokeDasharray="3 5" />
    <text className="chart-label" x="12" y="44" fontSize="10">{number.format(high)}</text><text className="chart-label" x="12" y="192" fontSize="10">{number.format(low)}</text>
    <polyline className="chart-history" points={history} fill="none" strokeWidth="2" strokeLinejoin="round" />
    <polyline className="chart-forecast" points={future} fill="none" strokeWidth="2.5" strokeDasharray="6 4" strokeLinejoin="round" />
    <text className="chart-label" x="70" y="221" fontSize="10">{points[0].date}</text><text className="chart-label" x="560" y="221" textAnchor="end" fontSize="10">{points[points.length - 1].date}</text>
  </svg><div className="forecast-legend"><span>— Historical data</span><span>– – Forecast</span></div></>;
}

export function ForecastPanel({ agent, disabled }: { agent: Agent; disabled: boolean }) {
  const [file, setFile] = useState<CsvFile | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [dateColumn, setDateColumn] = useState("");
  const [valueColumn, setValueColumn] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [method, setMethod] = useState("auto");
  const [horizon, setHorizon] = useState("7");
  const [windowSize, setWindowSize] = useState("3");
  const [alpha, setAlpha] = useState("0.3");
  const [season, setSeason] = useState("7");
  const [report, setReport] = useState<Report | null>(null);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    teamRequest("/api/forecasting/latest", { signal: abort.signal }).then((result) => {
      if (!abort.signal.aborted) { setReport(result.report); setExplanation(result.explanation || ""); }
    }).catch((failure: Error) => { if (!abort.signal.aborted) setError(failure.message); })
      .finally(() => { if (!abort.signal.aborted) setInitializing(false); });
    return () => controller.current?.abort();
  }, []);

  function begin() {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setError(""); return abort;
  }

  async function upload(selected: File) {
    const abort = begin(); setBusy(true); setFile(null); setColumns([]); setNote("");
    try {
      const csv = await readCsvFile(selected);
      if (abort.signal.aborted) return;
      const preview = await teamRequest("/api/forecasting/preview", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(csv) });
      if (abort.signal.aborted) return;
      setFile(csv); setColumns(preview.columns); setDateColumn(preview.columns[0] || ""); setValueColumn(preview.columns[1] || ""); setNote(preview.note);
    } catch (failure) { if (!abort.signal.aborted && failure instanceof Error) setError(failure.message); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }

  async function run() {
    if (!file || disabled) return;
    const abort = begin(); setBusy(true);
    try {
      const result = await teamRequest("/api/forecasting/run", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv_file: file, date_column: dateColumn, value_column: valueColumn, frequency, method, horizon: Number(horizon), window: Number(windowSize), alpha: Number(alpha), season_length: Number(season) }) });
      if (!abort.signal.aborted) { setReport(result); setExplanation(""); }
    } catch (failure) { if (!abort.signal.aborted && failure instanceof Error) setError(failure.message); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }

  async function explain() {
    if (!report || disabled) return;
    const abort = begin(); setExplaining(true);
    try {
      const result = await teamRequest("/api/forecasting/explain", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run_id: report.id }) });
      if (!abort.signal.aborted) setExplanation(result.explanation);
    } catch (failure) { if (!abort.signal.aborted && failure instanceof Error) setError(failure.message); }
    finally { if (!abort.signal.aborted) setExplaining(false); }
  }

  function download() {
    if (!report) return;
    const csv = "date,forecast\n" + report.forecast.map((point) => `${point.date},${point.value}`).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "mula-forecast.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const working = busy || explaining || initializing;
  const methods = Object.keys(names).filter((id) => agent.tools.includes(id));
  return <div className="forecast-panel">
    <p>Start with a CSV containing one date and one numeric total per period. Use YYYY-MM-DD dates with no missing periods. No machine learning or paid API is needed for the calculation.</p>
    <form onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <label className="forecast-upload">Upload historical data<input type="file" accept=".csv,text/csv" disabled={working || disabled} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void upload(selected); event.target.value = ""; }} /><small>UTF-8 CSV · Up to 50 KB / 500 rows · At least 6 periods</small></label>
      {note && <p role="status">{note}</p>}
      <div className="forecast-fields">
        <label>Date column<select value={dateColumn} onChange={(event) => setDateColumn(event.target.value)} disabled={working || !file || disabled} required><option value="">Select column</option>{columns.map((column) => <option key={column}>{column}</option>)}</select></label>
        <label>Value column<select value={valueColumn} onChange={(event) => setValueColumn(event.target.value)} disabled={working || !file || disabled} required><option value="">Select column</option>{columns.map((column) => <option key={column}>{column}</option>)}</select></label>
        <label>Frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value)} disabled={working || disabled}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>Periods ahead<input type="number" min="1" max="90" step="1" value={horizon} onChange={(event) => setHorizon(event.target.value)} disabled={working || disabled} required /></label>
        <label>Method<select value={method} onChange={(event) => setMethod(event.target.value)} disabled={working || disabled}><option value="auto">Compare enabled methods</option>{methods.map((id) => <option key={id} value={id}>{names[id]}</option>)}</select></label>
        <label>Moving average window<input type="number" min="2" max="60" step="1" value={windowSize} onChange={(event) => setWindowSize(event.target.value)} disabled={working || disabled} required /></label>
        <label>Smoothing weight (alpha)<input type="number" min="0.01" max="1" step="0.01" value={alpha} onChange={(event) => setAlpha(event.target.value)} disabled={working || disabled} required /></label>
        <label>Season length (periods)<input type="number" min="2" max="60" step="1" value={season} onChange={(event) => setSeason(event.target.value)} disabled={working || disabled} required /></label>
      </div>
      <p>Automatic comparison picks the lowest historical mean absolute error. Seasonal repeat needs two full cycles before the test period. Numerical parameters above control the calculation.</p>
      <div className="forecast-actions"><button className="account-submit" disabled={working || disabled || !file || methods.length === 0}>{busy && "Processing…"}{!busy && "Run forecast"}</button><span className="field-caption">Latest 20 reports saved to your account</span></div>
    </form>
    {initializing && <p role="status">Loading your last forecast…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {report && <section className="forecast-report" aria-label="Calculated forecast">
      <div className="eyebrow">LAST COMPLETED RUN</div><h3>{report.metric} · {names[report.method]}</h3>
      <p>{report.filename} · {report.history.length} historical periods · {report.forecast.length} {report.frequency} forecast periods<br />This saved result reflects its original inputs. Run again to apply changes.</p>
      <p>{report.method_description}</p>
      <ForecastChart report={report} />
      <div className="forecast-table-wrap"><table><caption className="sr-only">Forecast values</caption><thead><tr><th>Period</th><th>Forecast</th></tr></thead><tbody>{report.forecast.map((point) => <tr key={point.date}><td>{point.date}</td><td>{String(point.value)}</td></tr>)}</tbody></table></div>
      <div className="forecast-actions"><button type="button" className="text-button" onClick={download}>Download forecast CSV ↓</button>{agent.tools.includes("explain") && <button type="button" className="account-submit" onClick={explain} disabled={working || disabled}>{explaining && "Explaining…"}{!explaining && "Ask Forecasting to explain"}</button>}</div>
      {explaining && <p role="status"><span className="shimmer">{agent.name} is explaining the calculated report…</span></p>}
      {explanation && <div className="forecast-explanation" aria-label="Forecasting explanation">{explanation}</div>}
      <details open><summary>Historical accuracy & assumptions</summary><p>{report.backtest_periods} expanding-window, one-step tests from {report.backtest_start}. Lower MAE / RMSE is better; both use the original units.</p><div className="forecast-table-wrap"><table><thead><tr><th>Method</th><th>MAE</th><th>RMSE</th></tr></thead><tbody>{report.scores.map((score) => <tr key={score.method}><td>{names[score.method]}{score.method === report.method && " · selected"}</td><td>{number.format(score.mae)}</td><td>{number.format(score.rmse)}</td></tr>)}</tbody></table></div><ul>{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p>Run parameters: window {report.parameters.window}, alpha {report.parameters.alpha}, season {report.parameters.season_length}.</p></details>
    </section>}
  </div>;
}
