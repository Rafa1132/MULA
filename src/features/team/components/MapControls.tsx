"use client";

import { useState } from "react";
import { Icon } from "@/common/components";
import { STAMINA_EXPLANATION } from "../services/stamina";
import { MAX_ZOOM, MIN_ZOOM } from "../services/viewport";

type Props = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
};

// Zoom changes are multiplied, so compare with a little tolerance for rounding.
const ZOOM_TOLERANCE = 0.001;

/** The map's corner controls: zoom out, zoom % (resets to 100%), zoom in, fit, and what stamina means. */
export default function MapControls({ zoom, onZoomIn, onZoomOut, onReset, onFit }: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const percent = Math.round(zoom * 100);
  return <div className="map-controls">
    <p id="map-stamina-info" className="map-info" hidden={!infoOpen}>{STAMINA_EXPLANATION}</p>
    <div className="map-control-row" role="group" aria-label="Map view">
      <button type="button" className="map-control" aria-label="Zoom out" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM + ZOOM_TOLERANCE}><Icon name="zoomOut" /></button>
      <button type="button" className="map-control map-zoom-value" aria-label={`${percent}%, reset zoom to 100%`} onClick={onReset}>{percent}%</button>
      <button type="button" className="map-control" aria-label="Zoom in" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM - ZOOM_TOLERANCE}><Icon name="zoomIn" /></button>
      <button type="button" className="map-control" aria-label="Fit to screen" onClick={onFit}><Icon name="fit" /></button>
      <button type="button" className="map-control" aria-label="What is stamina?" aria-expanded={infoOpen} aria-controls="map-stamina-info"
        onClick={() => setInfoOpen(!infoOpen)} onKeyDown={(event) => { if (event.key === "Escape") setInfoOpen(false); }}><Icon name="info" /></button>
    </div>
  </div>;
}
