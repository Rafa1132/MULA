"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { readCsvFile } from "../services/csv";
import type { CsvFile } from "../services/csv";

export default function CsvAttachment({ value, onChange, onError, onReading, disabled, children }: {
  value: CsvFile | null;
  onChange: (file: CsvFile | null) => void;
  onError: (error: string) => void;
  onReading: (reading: boolean) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => () => { generation.current += 1; }, []);

  async function choose(files: FileList | null) {
    if (disabled || !files?.length) return;
    if (files.length !== 1) { onError("Attach one CSV at a time."); return; }
    const ticket = ++generation.current;
    onReading(true);
    setReading(true);
    onError("");
    onChange(null);
    try {
      const file = await readCsvFile(files[0]);
      if (ticket === generation.current) onChange(file);
    } catch (failure) {
      if (ticket === generation.current) {
        if (failure instanceof Error) onError(failure.message);
        else onError("Could not read this CSV. Please try again.");
      }
    } finally {
      if (ticket === generation.current) { setReading(false); onReading(false); }
    }
  }

  function remove() {
    generation.current += 1;
    setReading(false);
    onReading(false);
    onChange(null);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    dragDepth.current = 0;
    void choose(event.dataTransfer.files);
  }

  let className = "csv-dropzone";
  if (dragging && !disabled) className += " dragging";
  return <div className={className} onDrop={drop} onDragOver={(event) => event.preventDefault()}
    onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
    onDragLeave={() => { dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); }}>
    <input ref={picker} className="sr-only" type="file" accept=".csv,text/csv" aria-label="CSV file" tabIndex={-1} disabled={disabled || reading}
      onChange={(event) => { void choose(event.target.files); event.target.value = ""; }} />
    <div className="csv-attachment-toolbar">
      <button type="button" className="text-button attach-csv" onClick={() => picker.current?.click()} disabled={disabled || reading}>
        <span aria-hidden="true">＋</span>Attach CSV
      </button>
      <span>or drop it here · UTF-8 · up to 50 KB / 500 rows</span>
    </div>
    {reading && <p className="csv-reading" role="status">Reading CSV…</p>}
    {value && <div className="csv-file-chip"><span className="csv-file-badge">CSV</span><span className="csv-file-name">{value.name}</span>
      <button type="button" className="text-button" aria-label="Remove CSV attachment" onClick={remove} disabled={disabled}>Remove</button>
    </div>}
    {dragging && !disabled && <div className="csv-drop-hint">Drop your CSV to attach it</div>}
    {children}
  </div>;
}
