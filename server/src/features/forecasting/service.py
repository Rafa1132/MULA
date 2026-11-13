"""Small, deterministic forecasting tools. No model training or generated code."""
import calendar
from datetime import date, timedelta
import json
import math
import re
from statistics import fmean
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..operator.csv_files import CsvFile, prepare_csv

METHODS = ("naive", "moving_average", "exponential_smoothing", "seasonal_naive", "drift")


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    csv_file: CsvFile
    date_column: str = Field(min_length=1, max_length=2000)
    value_column: str = Field(min_length=1, max_length=2000)
    frequency: Literal["daily", "weekly", "monthly"] = "daily"
    method: Literal["auto", "naive", "moving_average", "exponential_smoothing", "seasonal_naive", "drift"] = "auto"
    horizon: int = Field(default=7, ge=1, le=90)
    window: int = Field(default=3, ge=2, le=60)
    alpha: float = Field(default=0.3, gt=0, le=1, allow_inf_nan=False)
    season_length: int = Field(default=7, ge=2, le=60)


def advance(start, steps, frequency):
    if frequency == "daily":
        return start + timedelta(days=steps)
    if frequency == "weekly":
        return start + timedelta(weeks=steps)
    month = start.year * 12 + start.month - 1 + steps
    year, month_index = divmod(month, 12)
    day = min(start.day, calendar.monthrange(year, month_index + 1)[1])
    return date(year, month_index + 1, day)


def series(request):
    payload, _ = prepare_csv(request.csv_file)
    parsed = json.loads(payload)
    if request.date_column == request.value_column:
        raise HTTPException(422, "Choose separate date and value columns.")
    try:
        date_index = parsed["columns"].index(request.date_column)
        value_index = parsed["columns"].index(request.value_column)
    except ValueError as error:
        raise HTTPException(422, "Choose columns from the uploaded CSV.") from error
    points = []
    for row in parsed["rows"]:
        text = row[date_index].strip()
        number = row[value_index].strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text, flags=re.ASCII):
            raise HTTPException(422, "Use dates formatted YYYY-MM-DD in every row.")
        try:
            timestamp = date.fromisoformat(text)
        except ValueError as error:
            raise HTTPException(422, "A CSV date is invalid.") from error
        if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", number, flags=re.ASCII):
            raise HTTPException(422, "Values must be plain numbers without blanks, currency symbols or thousands separators.")
        value = float(number)
        if not math.isfinite(value) or abs(value) > 1e12:
            raise HTTPException(422, "Values must be finite and between -1 trillion and 1 trillion.")
        points.append((timestamp, value))
    if len(points) < 6:
        raise HTTPException(422, "Add at least 6 historical periods for a forecast and backtest.")
    original = list(points)
    points.sort()
    if len({point[0] for point in points}) != len(points):
        raise HTTPException(422, "Use one total per date. Combine duplicate dates before forecasting.")
    # Anchor monthly steps on the first date to support month ends without drift.
    try:
        for index, (timestamp, _) in enumerate(points):
            if timestamp != advance(points[0][0], index, request.frequency):
                raise HTTPException(422, "Dates must be consecutive at the chosen frequency. Resolve missing periods first; blanks are not treated as zero.")
        future = [advance(points[0][0], len(points) + step, request.frequency).isoformat() for step in range(request.horizon)]
    except (ValueError, OverflowError) as error:
        raise HTTPException(422, "The forecast dates exceed the supported calendar range.") from error
    warnings = []
    if original != points:
        warnings.append("Rows were sorted by date before forecasting.")
    return points, future, warnings, parsed["header_adjustments"]


def predict(values, method, horizon, window, alpha, season):
    if method == "naive":
        return [values[-1]] * horizon
    if method == "moving_average":
        # Fixed trailing-window baseline: do not recursively insert predictions.
        return [fmean(values[-window:])] * horizon
    if method == "exponential_smoothing":
        level = values[0]
        for value in values[1:]:
            level = alpha * value + (1 - alpha) * level
        return [level] * horizon
    if method == "seasonal_naive":
        return [values[-season + step % season] for step in range(horizon)]
    if method == "drift":
        slope = (values[-1] - values[0]) / (len(values) - 1)
        return [values[-1] + slope * step for step in range(1, horizon + 1)]
    raise ValueError("Unknown forecast method")


def forecast(request, enabled_tools):
    points, future, warnings, adjustments = series(request)
    values = [point[1] for point in points]
    # All candidates use the same expanding-window, one-step test dates and
    # only observations before each origin. Never score on fitted training data.
    test_size = min(20, max(3, len(values) // 5))
    start = len(values) - test_size
    candidates = []
    skipped = []
    for method in METHODS:
        if method not in enabled_tools:
            continue
        minimum = 2
        if method == "moving_average":
            minimum = request.window
        if method == "seasonal_naive":
            minimum = 2 * request.season_length
        if start < minimum:
            skipped.append(method)
            continue
        candidates.append(method)
    if request.method != "auto":
        if request.method not in enabled_tools:
            raise HTTPException(403, "This forecasting method is disabled in My agents.")
        if request.method not in candidates:
            raise HTTPException(422, "Not enough history for this method and a backtest. Add more periods or reduce the window/season length.")
    if not candidates:
        raise HTTPException(422, "Enable a forecasting method with enough history in My agents.")
    scores = []
    for method in candidates:
        errors = []
        for index in range(start, len(values)):
            estimate = predict(values[:index], method, 1, request.window, request.alpha, request.season_length)[0]
            errors.append(estimate - values[index])
        scores.append({"method": method, "mae": fmean(abs(error) for error in errors), "rmse": math.sqrt(fmean(error * error for error in errors))})
    selected = request.method
    if selected == "auto":
        selected = min(scores, key=lambda item: item["mae"])["method"]
    estimates = predict(values, selected, request.horizon, request.window, request.alpha, request.season_length)
    descriptions = {
        "naive": f"Repeat the last observed value ({values[-1]}) at every future period.",
        "moving_average": f"Repeat the mean of the last {request.window} actual observations at every future period; forecasts are not fed back into the average.",
        "exponential_smoothing": f"Initialize the level at the first observation, update it through all {len(values)} observations with alpha {request.alpha}, then repeat the final level.",
        "seasonal_naive": f"Repeat the final {request.season_length} observed values in order for each future cycle.",
        "drift": f"Use all {len(values)} observations: slope = (last value {values[-1]} - first value {values[0]}) / {len(values) - 1} = {(values[-1] - values[0]) / (len(values) - 1)} per period. Forecast = last value + horizon step × slope. Moving-average window, smoothing alpha and season length do not apply to drift.",
    }
    warnings.append("Forecasts are estimates, not guarantees. Promotions, stockouts and other external factors are not modeled.")
    warnings.append("Backtest scores are one-step historical errors in the original units, not confidence intervals or an independent final test.")
    if request.horizon > test_size:
        warnings.append("Your forecast horizon is longer than the backtest sample; longer-range accuracy has not been measured.")
    if min(estimates) < 0:
        warnings.append("Some forecasts are negative. Values are not silently clipped; consider whether this method fits your metric.")
    if skipped:
        warnings.append("Insufficient history for these enabled methods: " + ", ".join(skipped) + ".")
    return {
        "method": selected, "frequency": request.frequency, "metric": request.value_column,
        "method_description": descriptions[selected],
        "filename": request.csv_file.name, "parameters": {"window": request.window, "alpha": request.alpha, "season_length": request.season_length},
        "history": [{"date": timestamp.isoformat(), "value": value} for timestamp, value in points],
        "forecast": [{"date": timestamp, "value": value} for timestamp, value in zip(future, estimates)],
        "scores": scores, "backtest_periods": test_size, "backtest_start": points[start][0].isoformat(),
        "warnings": warnings, "header_adjustments": adjustments,
    }
