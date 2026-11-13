import type { Agent, Delegation } from "./team";

// A card's centre as a fraction (0–1) of the map canvas, so a saved layout survives resizes.
export type Position = { x: number; y: number };
export type Layout = Record<string, Position>;
export type Size = { width: number; height: number };

// Staggered rather than aligned, so the first view already feels hand-placed.
export const DEFAULT_POSITIONS: Layout = {
  operator: { x: 0.3, y: 0.42 },
  forecasting: { x: 0.7, y: 0.62 },
};
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

/** Where the card's centre lands, keeping the point where it was grabbed under the pointer. */
export function pointerToFraction(canvas: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number, grabOffset: Position): Position {
  return {
    x: (clientX - grabOffset.x - canvas.left) / canvas.width,
    y: (clientY - grabOffset.y - canvas.top) / canvas.height,
  };
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

export type Link = { from: string; to: string; mode: Delegation; label: string };
export type Line = { x1: number; y1: number; x2: number; y2: number };

const LINK_LABELS: Record<Delegation, string> = { ask: "asks after your OK", auto: "asks directly", off: "" };

/** Who can ask whom, as the owner's delegation setting allows; "off" draws no link. */
export function agentLinks(agents: Agent[]): Link[] {
  const shown = new Set(agents.map((agent) => agent.id));
  const links: Link[] = [];
  for (const agent of agents) {
    if (!agent.delegation || agent.delegation === "off") continue;
    for (const target of agent.delegates_to) {
      if (shown.has(target)) links.push({ from: agent.id, to: target, mode: agent.delegation, label: LINK_LABELS[agent.delegation] });
    }
  }
  return links;
}

/** A line between two card centres (pixels), stopping `gap` outside each card; null when the cards are too close. */
export function lineBetween(from: Position, to: Position, card: Size, gap = 14): Line | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  // Distance from a card's centre to its border along the line (division by 0 gives Infinity).
  const edge = Math.min(card.width / 2 / Math.abs(ux), card.height / 2 / Math.abs(uy));
  const inset = edge + gap;
  if (length <= inset * 2) return null;
  return { x1: from.x + ux * inset, y1: from.y + uy * inset, x2: to.x - ux * inset, y2: to.y - uy * inset };
}

function count(amount: number, noun: string) {
  if (amount === 1) return `1 ${noun}`;
  return `${amount} ${noun}s`;
}
