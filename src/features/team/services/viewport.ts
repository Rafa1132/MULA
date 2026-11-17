// Pan and zoom maths for the agent map. A view maps world pixels to screen pixels:
// screen = world × zoom + (x, y), measured from the map's top-left corner.
import type { Point, Rect } from "./connectors";
import type { Size } from "./map";

export type View = { x: number; y: number; zoom: number };
export type KeyAction =
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "reset" }
  | { type: "fit" }
  | { type: "pan"; dx: number; dy: number };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 1.25;
// Below this zoom, cards show only the mascot, the name and the stamina bar.
export const LOW_DETAIL_ZOOM = 0.5;
export const PAN_STEP_PX = 60;
const FIT_PADDING_PX = 48;
// However far the map is panned, this much of the world stays on screen, so it can't be lost.
const KEEP_VISIBLE_PX = 120;
// Ctrl/Cmd + wheel and trackpad pinch: larger deltas are capped so one mouse notch is a gentle step.
const WHEEL_DELTA_LIMIT = 40;
const WHEEL_ZOOM_SPEED = 0.01;

const PAN_KEYS: Record<string, Point> = {
  // Moving the view right shows what is to the right, so the world shifts left.
  ArrowLeft: { x: PAN_STEP_PX, y: 0 },
  ArrowRight: { x: -PAN_STEP_PX, y: 0 },
  ArrowUp: { x: 0, y: PAN_STEP_PX },
  ArrowDown: { x: 0, y: -PAN_STEP_PX },
};

export function clampZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Change the zoom while the world point under `point` (screen pixels) stays where it is. */
export function zoomAt(view: View, zoom: number, point: Point): View {
  const next = clampZoom(zoom);
  const worldX = (point.x - view.x) / view.zoom;
  const worldY = (point.y - view.y) / view.zoom;
  return { zoom: next, x: point.x - worldX * next, y: point.y - worldY * next };
}

/** The view that shows all of `content`, centred, within the zoom range. */
export function fitView(content: Rect, viewport: Size): View {
  const padding = Math.min(FIT_PADDING_PX, viewport.width / 8, viewport.height / 8);
  const zoom = clampZoom(Math.min((viewport.width - padding * 2) / content.width, (viewport.height - padding * 2) / content.height));
  return {
    zoom,
    x: viewport.width / 2 - (content.x + content.width / 2) * zoom,
    y: viewport.height / 2 - (content.y + content.height / 2) * zoom,
  };
}

/** Clamp the zoom, and the pan so part of the world always stays on screen. */
export function clampView(view: View, viewport: Size, world: Size): View {
  const zoom = clampZoom(view.zoom);
  const keepX = Math.min(KEEP_VISIBLE_PX, viewport.width / 2);
  const keepY = Math.min(KEEP_VISIBLE_PX, viewport.height / 2);
  return {
    zoom,
    x: Math.min(viewport.width - keepX, Math.max(keepX - world.width * zoom, finite(view.x))),
    y: Math.min(viewport.height - keepY, Math.max(keepY - world.height * zoom, finite(view.y))),
  };
}

/** The map shortcut for a key, or null. Arrow keys pan only when the map itself has focus, not a card. */
export function keyAction(key: string, mapFocused: boolean): KeyAction | null {
  if (key === "+" || key === "=") return { type: "zoom-in" };
  if (key === "-" || key === "_") return { type: "zoom-out" };
  if (key === "0") return { type: "reset" };
  if (key === "f" || key === "F") return { type: "fit" };
  const pan = PAN_KEYS[key];
  if (pan && mapFocused) return { type: "pan", dx: pan.x, dy: pan.y };
  return null;
}

/** How much one Ctrl/Cmd + wheel event (or pinch step) zooms: below 1 zooms out. */
export function wheelZoomFactor(deltaY: number) {
  const capped = Math.max(-WHEEL_DELTA_LIMIT, Math.min(WHEEL_DELTA_LIMIT, deltaY));
  return Math.exp(-capped * WHEEL_ZOOM_SPEED);
}

/** The smallest rectangle around every card, or null when there are none. */
export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// The view is remembered per user in this browser only.
export function viewStorageKey(username: string) {
  return `mula.team.view.${username}`;
}

/** A saved view, or null when it is missing or malformed. */
export function parseView(raw: string | null): View | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { x, y, zoom } = value;
    if (![x, y, zoom].every((number) => typeof number === "number" && Number.isFinite(number))) return null;
    return { x, y, zoom: clampZoom(zoom) };
  } catch {
    // Unreadable JSON is treated like no saved view; the map fits every agent instead.
    return null;
  }
}

function finite(value: number) {
  if (Number.isFinite(value)) return value;
  return 0;
}
