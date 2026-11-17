"use client";

import { KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { boundsOf } from "@/common/viewport/viewport";
import { useViewport } from "@/common/viewport/useViewport";
import MapControls from "@/common/viewport/MapControls";
import { Graph, GraphNode } from "../services/notes";
import { MAP_WORLD, MapFilter, Point, describeGraph, filterGraph, folderStyles, layoutGraph, listGraph, mapViewKey, neighbours, nodeRadius, shapePath, topFolder } from "../services/graph";
import MapFilters from "./MapFilters";
import MapLegend from "./MapLegend";

type Props = {
  graph: Graph;
  filter: MapFilter;
  onFilter: (filter: MapFilter) => void;
  // The note last opened; the local graph centres on it and the map rings it.
  focus: string | null;
  username: string;
  onOpen: (nodeId: string) => void;
};

// Below this zoom, only the labels of the hovered note and its neighbours are shown.
const LABEL_ZOOM = 0.6;
const LABEL_OFFSET = 14;
const MAP_HELP = "Each shape is a note, coloured and shaped by its top-level folder. Lines are [[links]]. Bigger shapes have more links; dashed outlines are notes not created yet. Select a shape to open its note.";

function folderLabel(node: GraphNode) {
  if (node.kind === "ghost") return "not created yet";
  return topFolder(node) ?? "";
}

function titles(nodes: GraphNode[]) {
  return nodes.map((node) => node.title).join(", ");
}

/**
 * The Memory map: notes as shapes, links as lines, laid out by d3-force. Pan and zoom work like the
 * agent map. Hovering a note lights it and its neighbours; selecting it opens it in Folders. The
 * shapes are hidden from screen readers; the summary and "The map as a list" below say the same.
 */
export default function MemoryMap({ graph, filter, onFilter, focus, username, onOpen }: Props) {
  const shown = useMemo(() => filterGraph(graph, filter, focus), [graph, filter, focus]);
  // Styles come from the whole graph, so a folder keeps its colour and shape while filtering.
  const styles = useMemo(() => folderStyles(graph.nodes), [graph]);
  const previous = useRef(new Map<string, Point>());
  const positions = useMemo(() => layoutGraph(shown.nodes, shown.edges, previous.current), [shown]);
  useEffect(() => {
    previous.current = positions;
  }, [positions]);
  const around = useMemo(() => neighbours(shown.edges), [shown]);
  const content = useMemo(() => boundsOf(shown.nodes.map((node) => {
    const point = positions.get(node.id) ?? { x: 0, y: 0 };
    const radius = nodeRadius(around.get(node.id)?.size ?? 0);
    return { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 + LABEL_OFFSET + 6 };
  })), [shown, positions, around]);
  const viewport = useViewport(mapViewKey(username), content, { world: MAP_WORLD, ownDrags: ".graph-node" });
  const [hovered, setHovered] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const filtersClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (filtersOpen) filtersClose.current?.focus();
  }, [filtersOpen]);

  function closeFilters() {
    setFiltersOpen(false);
    filtersButton.current?.focus();
  }

  function onFiltersKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && filtersOpen) {
      event.stopPropagation();
      closeFilters();
    }
  }

  // Touch has no hover; a tap opens the note instead.
  function hoverStart(event: PointerEvent<SVGGElement>, id: string) {
    if (event.pointerType === "touch") return;
    setHovered(id);
  }

  const styleOf = new Map(styles.map((style) => [style.folder, style]));
  let lit: Set<string> | null = null;
  if (hovered !== null && positions.has(hovered)) lit = new Set([hovered, ...(around.get(hovered) ?? [])]);
  const focusTitle = graph.nodes.find((node) => node.id === focus)?.title ?? null;

  const view = viewport.view;
  let zoom = 1;
  let transform = "none";
  if (view) {
    zoom = view.zoom;
    transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  }
  let detail = "full";
  if (zoom < LABEL_ZOOM) detail = "low";
  // --zoom lets labels counter-scale, so they read at the same size at every zoom.
  const worldStyle = { width: MAP_WORLD.width, height: MAP_WORLD.height, transform, "--zoom": zoom } as CSSProperties;
  const summary = describeGraph(shown.nodes, shown.edges);

  function edgeState(source: string, target: string) {
    if (lit === null) return undefined;
    if (source === hovered || target === hovered) return "lit";
    return "dim";
  }

  function nodeState(id: string) {
    if (lit === null) return undefined;
    if (lit.has(id)) return "lit";
    return "dim";
  }

  return <div className="memory-map-layout" data-filters={filtersOpen}>
    <button ref={filtersButton} type="button" className="account-toggle graph-filters-open" aria-expanded={filtersOpen} aria-controls="graph-filters-panel"
      onClick={() => setFiltersOpen(true)}>Filters</button>
    <div className="graph-scrim" onClick={closeFilters} />
    <aside id="graph-filters-panel" className="graph-filters-panel" onKeyDown={onFiltersKey} aria-label="Map filters">
      <div className="graph-filters-head">
        <h2>Filters</h2>
        <button ref={filtersClose} type="button" className="icon-button graph-filters-close" aria-label="Close filters" onClick={closeFilters}>×</button>
      </div>
      <MapFilters filter={filter} onChange={onFilter} folders={styles} tags={graph.tags} focusTitle={focusTitle} />
    </aside>
    <div className="graph-main">
      <div className="memory-map" data-detail={detail}>
        <div ref={viewport.ref} className="map-viewport" tabIndex={0} role="region" aria-label="Memory map" aria-describedby="memory-map-summary memory-map-keys"
          data-panning={viewport.panning} {...viewport.handlers}>
          <div className="map-world" style={worldStyle} data-ready={view !== null} data-smooth={viewport.smooth}>
            <svg width={MAP_WORLD.width} height={MAP_WORLD.height} viewBox={`0 0 ${MAP_WORLD.width} ${MAP_WORLD.height}`} aria-hidden="true">
              <g className="graph-edges">
                {shown.edges.map((edge) => {
                  const from = positions.get(edge.source);
                  const to = positions.get(edge.target);
                  if (!from || !to) return null;
                  return <line key={`${edge.source}>${edge.target}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} data-state={edgeState(edge.source, edge.target)} />;
                })}
              </g>
              {shown.nodes.map((node) => {
                const point = positions.get(node.id);
                if (!point) return null;
                const radius = nodeRadius(around.get(node.id)?.size ?? 0);
                const style = styleOf.get(topFolder(node) ?? "");
                let shape = <path className="graph-shape graph-ghost-shape" d={shapePath("circle", radius)} />;
                if (node.kind !== "ghost" && style) shape = <path className="graph-shape" data-colour={style.colour} d={shapePath(style.shape, radius)} />;
                return <g key={node.id} className="graph-node" data-node={node.id} data-kind={node.kind} data-state={nodeState(node.id)} data-focus={node.id === focus}
                  transform={`translate(${point.x} ${point.y})`} onPointerEnter={(event) => hoverStart(event, node.id)} onPointerLeave={() => setHovered(null)}
                  onClick={() => onOpen(node.id)}>
                  {node.id === focus && <circle className="graph-focus-ring" r={radius + 7} />}
                  {shape}
                  <text className="graph-label" y={radius + LABEL_OFFSET}>{node.title}</text>
                </g>;
              })}
            </svg>
          </div>
          {shown.nodes.length === 0 && <p className="graph-empty">Nothing matches these filters.</p>}
        </div>
        <p id="memory-map-keys" className="sr-only">Plus and minus zoom, 0 resets to 100%, F fits the map, and the arrow keys pan. To open a note with the keyboard, use the map as a list below.</p>
        <MapControls zoom={zoom} onZoomIn={viewport.zoomIn} onZoomOut={viewport.zoomOut} onReset={viewport.resetZoom} onFit={viewport.fit}
          info={{ id: "memory-map-info", label: "How to read the map", text: MAP_HELP }} />
      </div>
      <MapLegend folders={styles.filter((style) => !filter.hiddenFolders.includes(style.folder))} ghosts={filter.ghosts && shown.nodes.some((node) => node.kind === "ghost")} />
      <p id="memory-map-summary" className="graph-summary" role="status">{summary}</p>
      <details className="graph-text">
        <summary>The map as a list</summary>
        <ul>
          {listGraph(shown.nodes, shown.edges).map((entry) => <li key={entry.node.id}>
            <button type="button" className="mention-title" onClick={() => onOpen(entry.node.id)}
              onFocus={() => setHovered(entry.node.id)} onBlur={() => setHovered(null)}
              onMouseEnter={() => setHovered(entry.node.id)} onMouseLeave={() => setHovered(null)}>{entry.node.title}</button>
            <span className="graph-text-folder"> · {folderLabel(entry.node)}</span>
            {entry.linksTo.length > 0 && <p>Links to {titles(entry.linksTo)}</p>}
            {entry.linkedFrom.length > 0 && <p>Linked from {titles(entry.linkedFrom)}</p>}
            {entry.linksTo.length === 0 && entry.linkedFrom.length === 0 && <p>No links shown</p>}
          </li>)}
        </ul>
      </details>
    </div>
  </div>;
}
