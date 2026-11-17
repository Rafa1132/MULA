"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { Agent, saveLayout } from "../services/team";
import type { Connections } from "../services/agentStore";
import { Layout, Position, WORLD, agentLinks, agentStatus, cardRect, centreOf, clampPosition, dragTo, isDrag, nudge, positionFor } from "../services/map";
import { Rect, routeConnector } from "../services/connectors";
import { LOW_DETAIL_ZOOM, boundsOf, viewStorageKey } from "../services/viewport";
import { staminaOf, staminaView } from "../services/stamina";
import { useViewport } from "../hooks/useViewport";
import MapControls from "./MapControls";
import PixelAgent from "./PixelAgent";
import StaminaBar from "./StaminaBar";

const KEY_SAVE_DELAY_MS = 600;
const TIP_HIDE_DELAY_MS = 150;

// origin: the card's centre in world pixels when the drag began.
type Drag = { id: string; pointerId: number; startX: number; startY: number; origin: Position; moved: boolean };

type Props = {
  agents: Agent[];
  // Who may hand work to whom, from the agent store; each connection is drawn as a line.
  connections: Connections;
  saved: Layout;
  selectedId: string | null;
  // The map view (zoom and position) is remembered per user in this browser.
  username: string;
  onOpen: (id: string) => void;
  // Called with "" after a successful save to clear an earlier message.
  onError: (message: string) => void;
};

export default function AgentMap({ agents, connections, saved, selectedId, username, onOpen, onError }: Props) {
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const keySave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const [positions, setPositions] = useState<Layout>(() => Object.fromEntries(agents.map((agent, index) => [agent.id, clampPosition(positionFor(agent.id, saved, index))])));
  const latest = useRef(positions);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // The link whose tooltip is showing, from hover or keyboard focus.
  const [tipKey, setTipKey] = useState<string | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cards, connectors and the fit box all come from the same world-pixel rectangles.
  const rects = new Map<string, Rect>(agents.map((agent, index) => [agent.id, cardRect(centreOf(positions[agent.id] ?? positionFor(agent.id, saved, index)))]));
  const viewport = useViewport(viewStorageKey(username), boundsOf([...rects.values()]));

  // A reset remounts the map; a pending keyboard save must not restore the old layout.
  useEffect(() => () => {
    if (keySave.current) clearTimeout(keySave.current);
    if (tipTimer.current) clearTimeout(tipTimer.current);
  }, []);

  // Each link with its curve; null routes (cards too close) draw nothing.
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const routed = agentLinks(agents, connections).map((link) => {
    const from = rects.get(link.from);
    const to = rects.get(link.to);
    if (!from || !to) return null;
    const others = [...rects].filter(([id]) => id !== link.from && id !== link.to).map(([, rect]) => rect);
    const route = routeConnector(from, to, others);
    if (!route) return null;
    return { key: `${link.from}-${link.to}`, link, route, text: `${names.get(link.from)} to ${names.get(link.to)}: ${link.label}` };
  }).filter((item) => item !== null);
  const tipped = routed.find((item) => item.key === tipKey);

  function showTip(key: string) {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    setTipKey(key);
  }

  // A short delay lets the pointer move from the line onto the tooltip without it disappearing.
  function hideTipSoon() {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTipKey(null), TIP_HIDE_DELAY_MS);
  }

  function connectors() {
    return routed.map(({ key, link, route, text }) =>
      <g key={key} className="map-link" data-link={key} data-planned={link.planned} tabIndex={0} role="img" aria-label={text}
        onPointerEnter={() => showTip(key)} onPointerLeave={hideTipSoon} onFocus={() => showTip(key)} onBlur={() => setTipKey(null)}
        onKeyDown={(event) => { if (event.key === "Escape") setTipKey(null); }}>
        {/* A wide invisible stroke makes the thin line easy to hover. */}
        <path className="map-link-hit" d={route.d} />
        <path className="map-link-line" d={route.d} />
        <path className="map-link-arrow" d={route.arrow} />
      </g>);
  }

  function place(id: string, position: Position) {
    latest.current = { ...latest.current, [id]: clampPosition(position) };
    setPositions(latest.current);
  }

  function persist() {
    const snapshot = latest.current;
    // Queue saves so a slow earlier request can't land after, and overwrite, a newer layout.
    saving.current = saving.current.then(async () => {
      try {
        await saveLayout(snapshot);
        onError("");
      } catch (failure) {
        if (failure instanceof Error) onError(`${failure.message} Your arrangement is shown but not saved yet.`);
      }
    });
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    suppressClick.current = false;
    if (event.button !== 0 || viewport.pinching.current) return;
    drag.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: centreOf(latest.current[id]), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // A second finger means the user is pinching the map, not moving this card.
    if (viewport.pinching.current) {
      finishDrag();
      return;
    }
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    // Small movements stay clicks, so opening a card never nudges it.
    if (!current.moved && !isDrag(dx, dy)) return;
    current.moved = true;
    setDraggingId(current.id);
    let zoom = 1;
    if (viewport.view) zoom = viewport.view.zoom;
    place(current.id, dragTo(current.origin, dx, dy, zoom));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    finishDrag();
  }

  function finishDrag() {
    const current = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (!current || !current.moved) return;
    // The browser still sends a click after the drop; it must not open the panel.
    suppressClick.current = true;
    persist();
  }

  function openCard(id: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpen(id);
  }

  function nudgeCard(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const next = nudge(latest.current[id], event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    // The map pans with the arrow keys too; a focused card takes them first.
    event.stopPropagation();
    place(id, next);
    if (keySave.current) clearTimeout(keySave.current);
    keySave.current = setTimeout(() => {
      keySave.current = null;
      persist();
    }, KEY_SAVE_DELAY_MS);
  }

  const view = viewport.view;
  let zoom = 1;
  let transform = "none";
  if (view) {
    zoom = view.zoom;
    transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  }
  let detail = "full";
  if (zoom < LOW_DETAIL_ZOOM) detail = "low";
  const worldStyle = { width: WORLD.width, height: WORLD.height, transform, "--zoom": zoom } as CSSProperties;

  return <div className="agent-map" data-detail={detail}>
    <div ref={viewport.ref} className="map-viewport" tabIndex={0} role="region" aria-label="Agent map" aria-describedby="map-keys"
      data-panning={viewport.panning} {...viewport.handlers}>
      <div className="map-world" style={worldStyle} data-ready={view !== null} data-smooth={viewport.smooth}>
        {/* Each line is a keyboard stop named with what it means; the text is shown only in a tooltip. */}
        <svg className="map-links" width={WORLD.width} height={WORLD.height} viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} role="group" aria-label="Connections between agents">{connectors()}</svg>
        {/* Counter-scaled so the tooltip reads at the same size at every zoom. Screen readers get the line's name instead. */}
        {tipped && <div className="map-link-tip-anchor" style={{ left: tipped.route.mid.x, top: tipped.route.mid.y }}>
          <div className="map-link-tip" aria-hidden="true" onPointerEnter={() => showTip(tipped.key)} onPointerLeave={hideTipSoon}>{tipped.text}</div>
        </div>}
        {agents.map((agent) => {
          const rect = rects.get(agent.id);
          if (!rect) return null;
          const status = agentStatus(agent);
          const stamina = staminaView(staminaOf(agent.stamina));
          return <button key={agent.id} type="button" className="map-card" style={{ left: rect.x, top: rect.y }} data-agent={agent.id}
            data-dragging={draggingId === agent.id} data-selected={selectedId === agent.id}
            aria-label={`Configure ${agent.name}`} aria-describedby={`map-status-${agent.id} map-stamina-${agent.id}`} aria-haspopup="dialog"
            onPointerDown={(event) => startDrag(event, agent.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
            onClick={() => openCard(agent.id)} onKeyDown={(event) => nudgeCard(event, agent.id)} onFocus={() => viewport.reveal(rect)}>
            <span className="pixel-tile"><PixelAgent id={agent.id} name={agent.name} /></span>
            <strong>{agent.name}</strong>
            <StaminaBar id={`map-stamina-${agent.id}`} view={stamina} />
            <span id={`map-status-${agent.id}`} className="map-card-status" data-warning={status.warning}>{status.text}</span>
          </button>;
        })}
      </div>
    </div>
    <p id="map-keys" className="sr-only">Plus and minus zoom, 0 resets to 100%, F fits every agent, and the arrow keys pan the map. With a card focused, the arrow keys move that card.</p>
    <MapControls zoom={zoom} onZoomIn={viewport.zoomIn} onZoomOut={viewport.zoomOut} onReset={viewport.resetZoom} onFit={viewport.fit} />
  </div>;
}
