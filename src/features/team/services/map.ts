import type { Rect } from "./connectors";
import type { Agent, Delegation } from "./team";

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

// active: the runtime can make this hand-off ("Ask me first" or "Go ahead").
// planned: drawn dashed. Either delegation is "Don't ask other agents" ("off"), or the connection was
// added in the panel and the runtime doesn't support it yet (only the server's delegates_to does).
export type LinkState = Delegation | "planned";
export type Link = { from: string; to: string; state: LinkState; label: string; planned: boolean };

// What each kind of link means. Lines carry no text; this appears in the line's tooltip, as its
// accessible name, and on the connection card in the settings panel.
const LINK_LABELS: Record<LinkState, string> = {
  ask: "Asks after your OK",
  auto: "Asks directly, without waiting for your OK",
  off: "Off: set to Don’t ask other agents",
  planned: "Planned: Mula doesn’t hand work along this yet",
};

/** One link per connection (from the agent store), drawn solid only when the runtime can use it. */
export function agentLinks(agents: Agent[], connections: Record<string, string[]>): Link[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const links: Link[] = [];
  for (const agent of agents) {
    for (const target of connections[agent.id] ?? []) {
      if (!byId.has(target) || target === agent.id) continue;
      let state: LinkState = "planned";
      if (agent.delegation && agent.delegates_to.includes(target)) state = agent.delegation;
      links.push({ from: agent.id, to: target, state, label: LINK_LABELS[state], planned: state === "off" || state === "planned" });
    }
  }
  return links;
}

function count(amount: number, noun: string) {
  if (amount === 1) return `1 ${noun}`;
  return `${amount} ${noun}s`;
}
