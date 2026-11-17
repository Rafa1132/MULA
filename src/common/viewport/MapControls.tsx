"use client";

import { useState } from "react";
import { Icon } from "@/common/components";
import { MAX_ZOOM, MIN_ZOOM } from "./viewport";
import "./viewport.css";

type Props = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  // An optional "i" button that explains something about this map (stamina, the legend).
  info?: { id: string; label: string; text: string };
};

// Zoom changes are multiplied, so compare with a little tolerance for rounding.
const ZOOM_TOLERANCE = 0.001;

/** A map's corner controls: zoom out, zoom % (resets to 100%), zoom in, fit, and an optional explanation. */
export default function MapControls({ zoom, onZoomIn, onZoomOut, onReset, onFit, info }: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const percent = Math.round(zoom * 100);
  return <div className="map-controls">
    {info && <p id={info.id} className="map-info" hidden={!infoOpen}>{info.text}</p>}
    <div className="map-control-row" role="group" aria-label="Map view">
      <button type="button" className="map-control" aria-label="Zoom out" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM + ZOOM_TOLERANCE}><Icon name="zoomOut" /></button>
      <button type="button" className="map-control map-zoom-value" aria-label={`${percent}%, reset zoom to 100%`} onClick={onReset}>{percent}%</button>
      <button type="button" className="map-control" aria-label="Zoom in" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM - ZOOM_TOLERANCE}><Icon name="zoomIn" /></button>
      <button type="button" className="map-control" aria-label="Fit to screen" onClick={onFit}><Icon name="fit" /></button>
      {info && <button type="button" className="map-control" aria-label={info.label} aria-expanded={infoOpen} aria-controls={info.id}
        onClick={() => setInfoOpen(!infoOpen)} onKeyDown={(event) => { if (event.key === "Escape") setInfoOpen(false); }}><Icon name="info" /></button>}
    </div>
  </div>;
}
