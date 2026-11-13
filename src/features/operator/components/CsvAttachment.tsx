"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { Icon } from "@/common/components";
import { readCsvFile } from "../services/csv";
import type { CsvFile } from "../services/csv";

// The composer pill: a "+" that picks one CSV, the children (the message form), and a drop
// zone over the whole pill. The attached file shows as a chip floating above it.
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
    <button type="button" className="icon-button attach-csv" aria-label="Attach CSV" title="Attach a CSV · UTF-8 · up to 50 KB / 500 rows" onClick={() => picker.current?.click()} disabled={disabled || reading}>
      <Icon name="plus" />
    </button>
    {children}
    {reading && <div className="csv-file-chip" role="status"><span className="csv-file-name shimmer">Reading CSV…</span></div>}
    {value && <div className="csv-file-chip"><span className="csv-file-badge">CSV</span><span className="csv-file-name">{value.name}</span>
      <button type="button" className="text-button" aria-label="Remove CSV attachment" onClick={remove} disabled={disabled}>Remove</button>
    </div>}
    {dragging && !disabled && <div className="csv-drop-hint">Drop your CSV to attach it</div>}
  </div>;
}
