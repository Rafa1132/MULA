"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { Agent, Delegation, saveLayout } from "../services/team";
import { Layout, Position, Size, agentLinks, agentStatus, clampToCanvas, isDrag, lineBetween, nudge, pointerToFraction, positionFor } from "../services/map";
import PixelAgent from "./PixelAgent";

// The card's raised bottom ledge is a box-shadow, outside its bounding box.
const LEDGE_PX = 10;
const KEY_SAVE_DELAY_MS = 600;
const LINK_DESCRIPTIONS: Record<Delegation, string> = { ask: "after you approve each request", auto: "without waiting for your approval", off: "" };

type Drag = { id: string; pointerId: number; startX: number; startY: number; grab: Position; moved: boolean };

type Props = {
  agents: Agent[];
  saved: Layout;
  selectedId: string | null;
  onOpen: (id: string) => void;
  // Called with "" after a successful save to clear an earlier message.
  onError: (message: string) => void;
};

export default function AgentMap({ agents, saved, selectedId, onOpen, onError }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const keySave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const [positions, setPositions] = useState<Layout>(() => Object.fromEntries(agents.map((agent, index) => [agent.id, positionFor(agent.id, saved, index)])));
  const latest = useRef(positions);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Phones get a stacked list: dragging small cards there fights page scrolling.
  const [movable, setMovable] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 700px)");
    const update = () => setMovable(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // A reset remounts the map; a pending keyboard save must not restore the old layout.
  useEffect(() => () => { if (keySave.current) clearTimeout(keySave.current); }, []);

  // Links are drawn in pixels, so they follow the canvas and card sizes.
  const [measured, setMeasured] = useState<{ canvas: Size; card: Size } | null>(null);
  useEffect(() => {
    const area = canvas.current;
    if (!area || !movable) return;
    const measure = () => {
      const card = area.querySelector(".map-card");
      if (!card) return;
      setMeasured({ canvas: { width: area.clientWidth, height: area.clientHeight }, card: { width: card.clientWidth, height: card.clientHeight + LEDGE_PX * 2 } });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [movable]);

  function centre(id: string, index: number, size: { canvas: Size; card: Size }) {
    const position = clampToCanvas(positions[id] ?? positionFor(id, saved, index), size.canvas, size.card);
    return { x: position.x * size.canvas.width, y: position.y * size.canvas.height };
  }

  function linkLines() {
    const size = measured;
    if (!movable || !size) return null;
    const indexes = new Map(agents.map((agent, index) => [agent.id, index]));
    return agentLinks(agents).map((link) => {
      const line = lineBetween(centre(link.from, indexes.get(link.from) ?? 0, size), centre(link.to, indexes.get(link.to) ?? 0, size), size.card);
      if (!line) return null;
      return <g key={`${link.from}-${link.to}`} className="map-link">
        <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} markerEnd="url(#map-arrow)" />
        <text x={(line.x1 + line.x2) / 2} y={(line.y1 + line.y2) / 2 - 10} textAnchor="middle">{link.label}</text>
      </g>;
    });
  }

  function place(id: string, position: Position, card: DOMRect) {
    const area = canvas.current;
    if (!area) return;
    const next = clampToCanvas(position, area.getBoundingClientRect(), { width: card.width, height: card.height + LEDGE_PX * 2 });
    latest.current = { ...latest.current, [id]: next };
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
    if (!movable || event.button !== 0) return;
    const card = event.currentTarget.getBoundingClientRect();
    drag.current = {
      id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false,
      grab: { x: event.clientX - (card.left + card.width / 2), y: event.clientY - (card.top + card.height / 2) },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    const area = canvas.current;
    if (!current || !area || current.pointerId !== event.pointerId) return;
    // Small movements stay clicks, so opening a card never nudges it.
    if (!current.moved && !isDrag(event.clientX - current.startX, event.clientY - current.startY)) return;
    current.moved = true;
    setDraggingId(current.id);
    place(current.id, pointerToFraction(area.getBoundingClientRect(), event.clientX, event.clientY, current.grab), event.currentTarget.getBoundingClientRect());
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDraggingId(null);
    if (!current.moved) return;
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
    if (!movable) return;
    const next = nudge(latest.current[id], event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    place(id, next, event.currentTarget.getBoundingClientRect());
    if (keySave.current) clearTimeout(keySave.current);
    keySave.current = setTimeout(() => {
      keySave.current = null;
      persist();
    }, KEY_SAVE_DELAY_MS);
  }

  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  return <div ref={canvas} className="agent-map" data-movable={movable}>
    <svg className="map-links" aria-hidden="true">
      <defs><marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" /></marker></defs>
      {linkLines()}
    </svg>
    <ul className="sr-only">{agentLinks(agents).map((link) => <li key={`${link.from}-${link.to}`}>{names.get(link.from)} can ask {names.get(link.to)} {LINK_DESCRIPTIONS[link.mode]}</li>)}</ul>
    {agents.map((agent, index) => {
      const position = positions[agent.id] ?? positionFor(agent.id, saved, index);
      const status = agentStatus(agent);
      const style = { "--x": position.x, "--y": position.y } as CSSProperties;
      return <button key={agent.id} type="button" className="map-card" style={style} data-agent={agent.id}
        data-dragging={draggingId === agent.id} data-selected={selectedId === agent.id}
        aria-label={`Configure ${agent.name}`} aria-describedby={`map-status-${agent.id}`} aria-haspopup="dialog"
        onPointerDown={(event) => startDrag(event, agent.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        onClick={() => openCard(agent.id)} onKeyDown={(event) => nudgeCard(event, agent.id)}>
        <span className="pixel-tile"><PixelAgent id={agent.id} name={agent.name} /></span>
        <strong>{agent.name}</strong>
        <span id={`map-status-${agent.id}`} className="map-card-status" data-warning={status.warning}>{status.text}</span>
      </button>;
    })}
  </div>;
}
