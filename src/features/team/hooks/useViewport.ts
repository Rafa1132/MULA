"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Point, Rect } from "../services/connectors";
import { WORLD } from "../services/map";
import type { Size } from "../services/map";
import { View, ZOOM_STEP, clampView, clampZoom, fitView, keyAction, parseView, wheelZoomFactor, zoomAt } from "../services/viewport";

const SAVE_DELAY_MS = 300;
// Firefox can report wheel deltas in lines rather than pixels.
const LINE_HEIGHT_PX = 16;
// A card revealed by keyboard focus keeps this much space from the map's edge.
const REVEAL_MARGIN_PX = 16;

type Pinch = { distance: number; midpoint: Point; view: View };
// Safari's trackpad pinch arrives as non-standard gesture events.
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

/**
 * Pan and zoom for the agent map. Spread `handlers` on the viewport element and attach `ref` to it.
 * `content` is the box around every card, used by "Fit to screen" and the first visit.
 */
export function useViewport(storageKey: string, content: Rect | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  // True for button and key actions, which glide; gestures follow the pointer directly.
  const [smooth, setSmooth] = useState(false);
  const [panning, setPanning] = useState(false);
  const latest = useRef<View | null>(null);
  const size = useRef<Size>({ width: 0, height: 0 });
  const bounds = useRef(content);
  const pointers = useRef(new Map<number, Point>());
  const pan = useRef<{ pointerId: number; last: Point } | null>(null);
  const pinch = useRef<Pinch | null>(null);
  // Read by card drags: a second finger turns a drag into a pinch.
  const pinching = useRef(false);

  useEffect(() => {
    bounds.current = content;
  });

  const apply = useCallback((next: View, animate: boolean) => {
    const clamped = clampView(next, size.current, WORLD);
    latest.current = clamped;
    setSmooth(animate);
    setView(clamped);
  }, []);

  const fit = useCallback((animate: boolean) => {
    const box = bounds.current;
    if (!box) {
      apply({ x: 0, y: 0, zoom: 1 }, animate);
      return;
    }
    apply(fitView(box, size.current), animate);
  }, [apply]);

  // Measure the viewport; the first measurement restores this user's view or fits every agent.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      size.current = { width: element.clientWidth, height: element.clientHeight };
      if (latest.current) {
        apply(latest.current, false);
        return;
      }
      const saved = readView(storageKey);
      if (saved) apply(saved, false);
      else fit(false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [apply, fit, storageKey]);

  useEffect(() => {
    if (!view) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(view));
      } catch (failure) {
        console.warn("Could not remember the agent map view in this browser.", failure);
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [view, storageKey]);

  // Wheel and Safari gestures need non-passive listeners so the page doesn't scroll or zoom instead.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let gestureZoom = 1;
    function onWheel(event: WheelEvent) {
      const current = latest.current;
      if (!current) return;
      event.preventDefault();
      let scale = 1;
      if (event.deltaMode === 1) scale = LINE_HEIGHT_PX;
      // Trackpad pinch in Chrome and Firefox arrives as a wheel event with ctrlKey set.
      if (event.ctrlKey || event.metaKey) {
        apply(zoomAt(current, current.zoom * wheelZoomFactor(event.deltaY * scale), local(event)), false);
        return;
      }
      apply({ ...current, x: current.x - event.deltaX * scale, y: current.y - event.deltaY * scale }, false);
    }
    function onGestureStart(event: Event) {
      event.preventDefault();
      gestureZoom = 1;
      if (latest.current) gestureZoom = latest.current.zoom;
    }
    function onGestureChange(event: Event) {
      const current = latest.current;
      if (!current) return;
      event.preventDefault();
      const gesture = event as GestureEvent;
      apply(zoomAt(current, gestureZoom * gesture.scale, local(gesture)), false);
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("gesturestart", onGestureStart);
    element.addEventListener("gesturechange", onGestureChange);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("gesturestart", onGestureStart);
      element.removeEventListener("gesturechange", onGestureChange);
    };
  }, [apply]);

  function local(event: { clientX: number; clientY: number }): Point {
    const element = ref.current;
    if (!element) return { x: event.clientX, y: event.clientY };
    const box = element.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function centre(): Point {
    return { x: size.current.width / 2, y: size.current.height / 2 };
  }

  function zoomBy(factor: number) {
    const current = latest.current;
    if (current) apply(zoomAt(current, current.zoom * factor, centre()), true);
  }

  function resetZoom() {
    const current = latest.current;
    if (current) apply(zoomAt(current, 1, centre()), true);
  }

  /** Pan a card into view when it gets keyboard focus off screen. */
  function reveal(rect: Rect) {
    const current = latest.current;
    if (!current) return;
    const left = rect.x * current.zoom + current.x;
    const top = rect.y * current.zoom + current.y;
    const right = left + rect.width * current.zoom;
    const bottom = top + rect.height * current.zoom;
    const visible = left >= REVEAL_MARGIN_PX && top >= REVEAL_MARGIN_PX && right <= size.current.width - REVEAL_MARGIN_PX && bottom <= size.current.height - REVEAL_MARGIN_PX;
    if (visible) return;
    apply({
      zoom: current.zoom,
      x: size.current.width / 2 - (rect.x + rect.width / 2) * current.zoom,
      y: size.current.height / 2 - (rect.y + rect.height / 2) * current.zoom,
    }, true);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, local(event));
    const current = latest.current;
    if (pointers.current.size === 2 && current) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: distance(a, b), midpoint: midpoint(a, b), view: current };
      pinching.current = true;
      pan.current = null;
      setPanning(false);
      return;
    }
    if (pointers.current.size !== 1 || event.button !== 0) return;
    // Cards handle their own drags, so dragging a card never pans the map.
    if (event.target instanceof Element && event.target.closest(".map-card")) return;
    pan.current = { pointerId: event.pointerId, last: local(event) };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const current = latest.current;
    if (!current) return;
    const gesture = pinch.current;
    if (gesture && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      if (gesture.distance < 1) return;
      // The world point that was under the fingers' midpoint stays under it as they move.
      const zoom = clampZoom(gesture.view.zoom * (distance(a, b) / gesture.distance));
      const worldX = (gesture.midpoint.x - gesture.view.x) / gesture.view.zoom;
      const worldY = (gesture.midpoint.y - gesture.view.y) / gesture.view.zoom;
      const middle = midpoint(a, b);
      apply({ zoom, x: middle.x - worldX * zoom, y: middle.y - worldY * zoom }, false);
      return;
    }
    const drag = pan.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    apply({ ...current, x: current.x + point.x - drag.last.x, y: current.y + point.y - drag.last.y }, false);
    drag.last = point;
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pinching.current = false;
    if (pan.current && pan.current.pointerId === event.pointerId) {
      pan.current = null;
      setPanning(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Leave the browser's own Ctrl/Cmd shortcuts (such as page zoom) alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = keyAction(event.key, event.target === event.currentTarget);
    const current = latest.current;
    if (!action || !current) return;
    event.preventDefault();
    if (action.type === "zoom-in") zoomBy(ZOOM_STEP);
    else if (action.type === "zoom-out") zoomBy(1 / ZOOM_STEP);
    else if (action.type === "reset") resetZoom();
    else if (action.type === "fit") fit(true);
    else apply({ ...current, x: current.x + action.dx, y: current.y + action.dy }, true);
  }

  return {
    ref, view, smooth, panning, pinching, reveal, resetZoom,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    fit: () => fit(true),
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onKeyDown },
  };
}

function readView(storageKey: string) {
  try {
    return parseView(localStorage.getItem(storageKey));
  } catch (failure) {
    console.warn("Could not read the saved agent map view; fitting every agent instead.", failure);
    return null;
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
