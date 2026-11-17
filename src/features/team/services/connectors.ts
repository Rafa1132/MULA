// Connector routing for the agent map: smooth cubic Bézier curves between the facing edges of two
// cards, steering around any other card. Everything is in world pixels.
export type Point = { x: number; y: number };
// x and y are the top-left corner.
export type Rect = { x: number; y: number; width: number; height: number };
// Start, first control point, second control point, end.
export type Cubic = [Point, Point, Point, Point];
export type Route = {
  cubics: Cubic[];
  // SVG path data for the line: one "C" per cubic, so there are no straight runs or corners.
  d: string;
  // SVG path data for the open chevron at the end, pointing along the curve's final direction.
  arrow: string;
  // Points along the curve, used to check clearance and to place the tooltip.
  samples: Point[];
  // Halfway along the curve, where the tooltip appears.
  mid: Point;
};
export type Axis = "horizontal" | "vertical";

// Space between a line's end and the card border, so lines never touch borders.
export const CONNECTOR_GAP = 12;
// How far a line keeps from cards it passes.
export const OBSTACLE_MARGIN = 16;
// The shortest control handle, so a line always leaves and enters a card straight, even when the cards are close.
const MIN_HANDLE = 40;
const SAMPLES_PER_CUBIC = 32;
// Waypoint heights tried above and below a card in the way, in steps of OBSTACLE_MARGIN.
const LANE_STEPS = 12;
const ARROW_LENGTH = 8;
const ARROW_HALF_WIDTH = 5;

/** Join the edges that face each other across the wider gap: left/right, or top/bottom. */
export function facingAxis(from: Rect, to: Rect): Axis {
  const horizontalGap = Math.max(to.x - (from.x + from.width), from.x - (to.x + to.width));
  const verticalGap = Math.max(to.y - (from.y + from.height), from.y - (to.y + to.height));
  if (horizontalGap >= verticalGap) return "horizontal";
  return "vertical";
}

/** The curve from one card to another, or null when the cards are too close to fit a line between them. */
export function routeConnector(from: Rect, to: Rect, obstacles: Rect[], gap = CONNECTOR_GAP): Route | null {
  let cubics: Cubic[] | null;
  if (facingAxis(from, to) === "horizontal") {
    cubics = routeAcross(from, to, obstacles, gap);
  } else {
    // A vertical route is a horizontal one with x and y swapped, so one router covers both.
    const swapped = routeAcross(transpose(from), transpose(to), obstacles.map(transpose), gap);
    cubics = null;
    if (swapped) cubics = swapped.map((cubic) => cubic.map(transposePoint) as Cubic);
  }
  if (!cubics) return null;
  const samples = sampleCubics(cubics);
  return { cubics, d: pathData(cubics), arrow: arrowHead(cubics[cubics.length - 1]), samples, mid: halfway(samples) };
}

/** True when no point along the curve falls inside another card (with margin) or either of its own cards. */
export function isClear(samples: Point[], from: Rect, to: Rect, obstacles: Rect[]) {
  const blocked = [...obstacles.map((rect) => inflate(rect, OBSTACLE_MARGIN)), from, to];
  return samples.every((point) => blocked.every((rect) => !inside(point, rect)));
}

/** A point on a cubic Bézier at t (0–1). */
export function pointOn(cubic: Cubic, t: number): Point {
  const [p0, p1, p2, p3] = cubic;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

// Routes in "horizontal" space: the line leaves `from` sideways and enters `to` sideways.
function routeAcross(from: Rect, to: Rect, obstacles: Rect[], gap: number): Cubic[] | null {
  let direction = 1;
  if (to.x + to.width / 2 < from.x + from.width / 2) direction = -1;
  let start = { x: from.x + from.width + gap, y: from.y + from.height / 2 };
  let end = { x: to.x - gap, y: to.y + to.height / 2 };
  if (direction === -1) {
    start = { x: from.x - gap, y: from.y + from.height / 2 };
    end = { x: to.x + to.width + gap, y: to.y + to.height / 2 };
  }
  if ((end.x - start.x) * direction <= 0) return null;

  // First the plain S-curve, then curves through a waypoint above or below the cards in the way.
  // At the waypoint the curve runs level, so the two halves join without a corner.
  const candidates: Cubic[][] = [[segment(start, end, direction)]];
  const cards = [from, to, ...obstacles];
  const lanes = [Math.min(...cards.map((rect) => rect.y)) - OBSTACLE_MARGIN * 2, Math.max(...cards.map((rect) => rect.y + rect.height)) + OBSTACLE_MARGIN * 2];
  // A curve is still climbing when it reaches a card's corner, so its waypoint must sit well clear of the
  // card; try rising heights and keep the shortest clear one.
  for (const rect of obstacles) {
    for (let step = 1; step <= LANE_STEPS; step += 1) lanes.push(rect.y - OBSTACLE_MARGIN * step, rect.y + rect.height + OBSTACLE_MARGIN * step);
  }
  const crossings = [(start.x + end.x) / 2];
  for (const rect of obstacles) {
    const centre = rect.x + rect.width / 2;
    if ((centre - start.x) * direction > 0 && (end.x - centre) * direction > 0) crossings.push(centre);
  }
  for (const y of lanes) {
    for (const x of crossings) {
      const waypoint = { x, y };
      candidates.push([segment(start, waypoint, direction), segment(waypoint, end, direction)]);
    }
  }

  // When nothing is clear (cards packed tightly), fall back to the plain curve.
  let best = candidates[0];
  let bestLength = Infinity;
  for (const cubics of candidates) {
    const samples = sampleCubics(cubics);
    if (!isClear(samples, from, to, obstacles)) continue;
    const length = polylineLength(samples);
    if (length < bestLength) {
      best = cubics;
      bestLength = length;
    }
  }
  return best;
}

// Both handles point along the travel direction, so the curve is level at each end.
function segment(start: Point, end: Point, direction: number): Cubic {
  const handle = Math.max(MIN_HANDLE, Math.abs(end.x - start.x) / 2);
  return [start, { x: start.x + direction * handle, y: start.y }, { x: end.x - direction * handle, y: end.y }, end];
}

function sampleCubics(cubics: Cubic[]) {
  const points: Point[] = [];
  cubics.forEach((cubic, index) => {
    // Each cubic starts where the previous one ended, so skip its first point after the first cubic.
    for (let step = 0; step <= SAMPLES_PER_CUBIC; step += 1) {
      if (index > 0 && step === 0) continue;
      points.push(pointOn(cubic, step / SAMPLES_PER_CUBIC));
    }
  });
  return points;
}

function pathData(cubics: Cubic[]) {
  let d = `M${format(cubics[0][0])}`;
  for (const [, c1, c2, end] of cubics) d += ` C${format(c1)} ${format(c2)} ${format(end)}`;
  return d;
}

// The end tangent of a cubic is the direction from its second control point to its end.
function arrowHead(cubic: Cubic) {
  const [, , control, tip] = cubic;
  const length = distance(control, tip);
  const ux = (tip.x - control.x) / length;
  const uy = (tip.y - control.y) / length;
  const base = { x: tip.x - ux * ARROW_LENGTH, y: tip.y - uy * ARROW_LENGTH };
  const one = { x: base.x - uy * ARROW_HALF_WIDTH, y: base.y + ux * ARROW_HALF_WIDTH };
  const other = { x: base.x + uy * ARROW_HALF_WIDTH, y: base.y - ux * ARROW_HALF_WIDTH };
  return `M${format(one)} L${format(tip)} L${format(other)}`;
}

function halfway(samples: Point[]) {
  const target = polylineLength(samples) / 2;
  let travelled = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const step = distance(samples[index - 1], samples[index]);
    if (travelled + step >= target) return samples[index];
    travelled += step;
  }
  return samples[samples.length - 1];
}

function polylineLength(points: Point[]) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += distance(points[index - 1], points[index]);
  return length;
}

function inside(point: Point, rect: Rect) {
  return point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height;
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function inflate(rect: Rect, amount: number): Rect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

function transpose(rect: Rect): Rect {
  return { x: rect.y, y: rect.x, width: rect.height, height: rect.width };
}

function transposePoint(point: Point): Point {
  return { x: point.y, y: point.x };
}

function format(point: Point) {
  return `${Math.round(point.x * 10) / 10} ${Math.round(point.y * 10) / 10}`;
}
