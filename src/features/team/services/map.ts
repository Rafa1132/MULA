import type { Rect } from "./connectors";
import type { Agent, LinkMode } from "./team";

// A card's centre as a fraction (0–1) of the map's world, so a saved layout doesn't depend on the screen.
// The world is a fixed 1600 × 1000 pixel plane that the viewport pans and zooms over.
export type Position = { x: number; y: number };
export type Layout = Record<string, Position>;
export type Size = { width: number; height: number };

// Staggered rather than aligned, so the first view already feels hand-placed.
export const DEFAULT_POSITIONS: Layout = {
  operator: { x: 0.3, y: 0.42 },
  forecasting: { x: 0.7, y: 0.62 },
};
export const WORLD: Size = { width: 1600, height: 1000 };
// Matches .map-card in team.css. The card's raised ledge is a box-shadow drawn below the box.
export const CARD: Size = { width: 232, height: 256 };
// Below this zoom, cards show only the mascot, the name and the stamina bar.
export const LOW_DETAIL_ZOOM = 0.5;

// The map's pan and zoom are remembered per user in this browser only.
export function viewStorageKey(username: string) {
  return `mula.team.view.${username}`;
}
export const CARD_LEDGE = 6;
export const DRAG_THRESHOLD_PX = 5;
export const NUDGE = 0.02;
export const LARGE_NUDGE = 0.08;

const ARROW_STEPS: Record<string, Position> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export function clampFraction(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function positionFor(id: string, saved: Layout, index: number): Position {
  if (saved[id]) return saved[id];
  if (DEFAULT_POSITIONS[id]) return DEFAULT_POSITIONS[id];
  // Agents added later without a default spread along a diagonal instead of stacking.
  const step = (index % 5) * 0.15;
  return { x: 0.2 + step, y: 0.25 + step / 2 };
}

/** Keep the whole card on the canvas, not just its centre. */
export function clampToCanvas(position: Position, canvas: Size, card: Size): Position {
  const marginX = Math.min(0.5, card.width / 2 / canvas.width);
  const marginY = Math.min(0.5, card.height / 2 / canvas.height);
  return {
    x: clampFraction(position.x, marginX, 1 - marginX),
    y: clampFraction(position.y, marginY, 1 - marginY),
  };
}

/** A position clamped so the whole card, ledge included, stays in the world. */
export function clampPosition(position: Position): Position {
  return clampToCanvas(position, WORLD, { width: CARD.width, height: CARD.height + CARD_LEDGE * 2 });
}

/** A card's centre in world pixels. */
export function centreOf(position: Position): Position {
  const clamped = clampPosition(position);
  return { x: clamped.x * WORLD.width, y: clamped.y * WORLD.height };
}

/** The card's box in world pixels, ledge included, for connectors and fitting. */
export function cardRect(centre: Position): Rect {
  return { x: centre.x - CARD.width / 2, y: centre.y - CARD.height / 2, width: CARD.width, height: CARD.height + CARD_LEDGE };
}

/** Where a dragged card's centre lands: screen movement is divided by the zoom to get world movement. */
export function dragTo(origin: Position, dx: number, dy: number, zoom: number): Position {
  return clampPosition({ x: (origin.x + dx / zoom) / WORLD.width, y: (origin.y + dy / zoom) / WORLD.height });
}

export function isDrag(dx: number, dy: number) {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

// The smallest space between two cards, in world pixels (so the same at every zoom).
export const CARD_GAP = 24;
// How far apart, in world pixels, the free-spot search tries positions.
const SEARCH_STEP = 8;

/** True when two card boxes come closer than `gap`. Exactly `gap` apart is not an overlap. */
export function overlaps(a: Rect, b: Rect, gap = CARD_GAP) {
  const apartX = a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x;
  const apartY = a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;
  return !apartX && !apartY;
}

/** True when the card `id` at `position` keeps CARD_GAP from every other card in `layout`. */
function isClear(id: string, position: Position, layout: Layout) {
  const box = cardRect(centreOf(position));
  for (const [other, placed] of Object.entries(layout)) {
    if (other === id) continue;
    if (overlaps(box, cardRect(centreOf(placed)))) return false;
  }
  return true;
}

/**
 * The nearest position to `position` where card `id` keeps CARD_GAP from every other card in
 * `layout` (its own entry is ignored), with the whole card inside the world. It searches outward in
 * rings SEARCH_STEP apart and takes the closest clear spot on the first ring that has one, so the
 * result is the same every time. If the world has no room left, the card stays where it was put.
 */
export function freeSpot(id: string, position: Position, layout: Layout): Position {
  const start = clampPosition(position);
  if (isClear(id, start, layout)) return start;
  const centre = centreOf(start);
  const reach = Math.max(WORLD.width, WORLD.height);
  for (let radius = SEARCH_STEP; radius <= reach; radius += SEARCH_STEP) {
    // About one sample every SEARCH_STEP pixels around the ring.
    const samples = Math.max(8, Math.ceil((2 * Math.PI * radius) / SEARCH_STEP));
    let best: Position | null = null;
    let bestDistance = Infinity;
    for (let index = 0; index < samples; index++) {
      const angle = (2 * Math.PI * index) / samples;
      const candidate = clampPosition({
        x: (centre.x + Math.cos(angle) * radius) / WORLD.width,
        y: (centre.y + Math.sin(angle) * radius) / WORLD.height,
      });
      if (!isClear(id, candidate, layout)) continue;
      // Clamping at the world's edge can pull a candidate closer, so compare real distances.
      const moved = centreOf(candidate);
      const distance = Math.hypot(moved.x - centre.x, moved.y - centre.y);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (best) return best;
  }
  return start;
}

/**
 * Places cards one at a time in the order given: each keeps its position unless it overlaps a card
 * already placed, in which case it moves to the nearest free spot. Earlier ids win their spot.
 */
export function settleLayout(ids: string[], layout: Layout): Layout {
  const placed: Layout = {};
  for (const id of ids) {
    const position = layout[id];
    if (!position) continue;
    placed[id] = freeSpot(id, position, placed);
  }
  return placed;
}

/**
 * The map's starting layout: saved, default or fallback positions, settled so no cards overlap.
 * Agents with a saved position are placed first, so an arrangement the owner made is kept wherever
 * it is already clear, and agents without one make room around it.
 */
export function initialLayout(ids: string[], saved: Layout): Layout {
  const layout: Layout = {};
  ids.forEach((id, index) => {
    layout[id] = positionFor(id, saved, index);
  });
  const ordered = [...ids.filter((id) => saved[id]), ...ids.filter((id) => !saved[id])];
  return settleLayout(ordered, layout);
}

/** The position after an arrow key, or null for any other key. */
export function nudge(position: Position, key: string, large: boolean): Position | null {
  const direction = ARROW_STEPS[key];
  if (!direction) return null;
  let amount = NUDGE;
  if (large) amount = LARGE_NUDGE;
  return { x: position.x + direction.x * amount, y: position.y + direction.y * amount };
}

export function agentStatus(agent: Agent): { text: string; warning: boolean } {
  const brain = agent.available_brains[agent.brain];
  if (brain && brain.status === "needs_setup") return { text: "Brain needs setup", warning: true };
  if (brain) return { text: `Ready · ${brain.name}`, warning: false };
  return { text: `Ready · ${count(agent.tools.length, "tool")}`, warning: false };
}

// A link is one A2A connection (server/src/features/a2a) the owner saved in the panel: "ask" and
// "auto" are active and drawn solid; "off" is connected but switched off, drawn dashed. Links set to
// "none" are not connections and draw nothing.
export type LinkState = Exclude<LinkMode, "none">;
export type Link = { from: string; to: string; state: LinkState; label: string; planned: boolean };

// What each kind of link means. Lines carry no text; this appears in the line's tooltip, as its
// accessible name, and on the connection card in the settings panel.
export const LINK_LABELS: Record<LinkState, string> = {
  ask: "Asks after your OK",
  auto: "Asks directly, without waiting for your OK",
  off: "Off: connected, but won’t ask",
};

/** One link per connection, with the mode saved on the asking agent. */
export function agentLinks(agents: Agent[], connections: Record<string, string[]>): Link[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const links: Link[] = [];
  for (const agent of agents) {
    for (const target of connections[agent.id] ?? []) {
      if (!byId.has(target) || target === agent.id) continue;
      const mode = agent.links?.[target];
      if (mode !== "ask" && mode !== "auto" && mode !== "off") continue;
      links.push({ from: agent.id, to: target, state: mode, label: LINK_LABELS[mode], planned: mode === "off" });
    }
  }
  return links;
}

function count(amount: number, noun: string) {
  if (amount === 1) return `1 ${noun}`;
  return `${amount} ${noun}s`;
}
