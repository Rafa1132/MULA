"use client";

import { FolderStyle, nodeRadius, shapePath } from "../services/graph";

const SWATCH_RADIUS = nodeRadius(0);
const SWATCH_SIZE = 22;

/** A folder's shape in its colour, as drawn on the map. Decorative: the folder name is always beside it. */
export function FolderSwatch({ style }: { style: FolderStyle }) {
  return <svg className="graph-swatch" width={SWATCH_SIZE} height={SWATCH_SIZE} viewBox={`${-SWATCH_SIZE / 2} ${-SWATCH_SIZE / 2} ${SWATCH_SIZE} ${SWATCH_SIZE}`} aria-hidden="true">
    <path d={shapePath(style.shape, SWATCH_RADIUS)} className="graph-shape" data-colour={style.colour} />
  </svg>;
}

function GhostSwatch() {
  return <svg className="graph-swatch" width={SWATCH_SIZE} height={SWATCH_SIZE} viewBox={`${-SWATCH_SIZE / 2} ${-SWATCH_SIZE / 2} ${SWATCH_SIZE} ${SWATCH_SIZE}`} aria-hidden="true">
    <path d={shapePath("circle", SWATCH_RADIUS)} className="graph-shape graph-ghost-shape" />
  </svg>;
}

/** What each colour and shape means, plus the dashed outline for links to notes not created yet. */
export default function MapLegend({ folders, ghosts }: { folders: FolderStyle[]; ghosts: boolean }) {
  return <ul className="graph-legend" aria-label="Legend">
    {folders.map((style) => <li key={style.folder}><FolderSwatch style={style} />{style.folder}</li>)}
    {ghosts && <li><GhostSwatch />Not created yet</li>}
    <li className="graph-legend-size">Bigger shapes have more links</li>
  </ul>;
}
