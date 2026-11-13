"""Bounded CSV ingestion. Uploaded cells are data, never executable code."""
import csv
from decimal import Decimal, localcontext
import io
import json
import re

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

MAX_BYTES = 50_000
MAX_ROWS = 500
MAX_COLUMNS = 40
MAX_CONTEXT = 24_000


class CsvFile(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=MAX_BYTES)


def normalize_headers(raw_headers):
    originals = [cell.strip() for cell in raw_headers]
    reserved = set(originals) - {""}
    used = set()
    headers = []
    adjustments = []
    for index, original in enumerate(originals):
        base = original
        if not base:
            base = f"Column {index + 1}"
        candidate = base
        suffix = 2
        # Preserve names already supplied elsewhere, including names such as
        # "Sales (2)" and "Column 1", rather than stealing them for a repair.
        while candidate in used or (candidate != original and candidate in reserved):
            candidate = f"{base} ({suffix})"
            suffix += 1
        used.add(candidate)
        headers.append(candidate)
        if candidate != original:
            adjustments.append({"column": index + 1, "original": raw_headers[index], "assigned": candidate})
    return headers, adjustments


def prepare_csv(file: CsvFile) -> tuple[str, str]:
    if not file.name.lower().endswith(".csv") or any(
        character in "/\\" or ord(character) < 32 or ord(character) == 127
        or 0xD800 <= ord(character) <= 0xDFFF for character in file.name
    ):
        raise HTTPException(422, "Attach a CSV with a plain filename ending in .csv.")
    try:
        size = len(file.content.encode("utf-8"))
    except UnicodeError as error:
        raise HTTPException(422, "CSV must contain valid UTF-8 text.") from error
    if size > MAX_BYTES:
        raise HTTPException(413, "CSV files must be 50 KB or smaller.")
    content = file.content.lstrip("\ufeff")
    if any(ord(character) < 32 and character not in "\t\r\n" for character in content):
        raise HTTPException(422, "CSV contains binary or unsupported control characters. Export it as UTF-8 CSV.")
    try:
        dialect = csv.Sniffer().sniff(content[:8192], delimiters=",;\t|")
    except csv.Error:
        # Also allow one-column CSVs; inconsistent rows are checked below.
        dialect = csv.excel
    reader = csv.reader(io.StringIO(content, newline=""), dialect=dialect, strict=True)
    rows = []
    try:
        for row in reader:
            if not row:
                continue
            # A delimiter-only first row is a valid set of unnamed columns.
            # Keep it as the header; subsequent wholly blank records are skipped.
            if rows and all(not cell.strip() for cell in row):
                continue
            if len(row) > MAX_COLUMNS or any(len(cell) > 2000 for cell in row):
                raise HTTPException(422, "CSV supports up to 40 columns and 2,000 characters per cell.")
            rows.append(row)
            if len(rows) > MAX_ROWS + 1:
                raise HTTPException(422, "CSV supports up to 500 data rows. Attach a smaller export.")
    except csv.Error as error:
        raise HTTPException(422, "CSV could not be parsed. Check delimiters and quoted values.") from error
    if len(rows) < 2:
        raise HTTPException(422, "CSV needs a header row and at least one data row.")
    headers, adjustments = normalize_headers(rows[0])
    data = rows[1:]
    if any(len(row) != len(headers) for row in data):
        raise HTTPException(422, "Every CSV row must have the same number of columns as the header.")

    numeric = {}
    missing = {}
    for index, header in enumerate(headers):
        values = [row[index].strip() for row in data if row[index].strip()]
        missing[header] = len(data) - len(values)
        # Only unambiguous plain decimal columns are aggregated. Currency,
        # percentages, thousands separators and mixed values remain text.
        if values and all(re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", value, flags=re.ASCII) for value in values):
            if any(len(value) > 100 for value in values):
                continue
            numbers = [Decimal(value) for value in values]
            # Use enough precision for exact sums of the bounded inputs.
            with localcontext() as context:
                context.prec = 210
                numeric[header] = {"count": len(numbers), "sum": str(sum(numbers)),
                                   "min": str(min(numbers)), "max": str(max(numbers))}
    payload = json.dumps({"filename": file.name, "data_rows": len(data), "columns": headers,
                          "header_adjustments": adjustments,
                          "missing_values": missing, "numeric_summaries": numeric,
                          "rows": data}, ensure_ascii=False)
    if len(payload) > MAX_CONTEXT:
        raise HTTPException(413, "CSV is too large for the Operator's current context. Attach a smaller export; no rows were sent.")
    note = f"CSV: {file.name} · {len(data)} rows · {len(headers)} columns"
    if adjustments:
        labels = []
        for adjustment in adjustments[:3]:
            assigned = adjustment["assigned"]
            if len(assigned) > 64:
                assigned = assigned[:61] + "…"
            labels.append(f"column {adjustment['column']} → {assigned}")
        note += " · Auto-named: " + "; ".join(labels)
        if len(adjustments) > 3:
            note += f"; +{len(adjustments) - 3} more"
    return payload, note
