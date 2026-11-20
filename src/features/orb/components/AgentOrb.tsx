"use client";

// A soft, glowing orb that shows what an agent is doing: idle, listening, thinking or speaking.
// One <canvas>, one requestAnimationFrame loop, no animation library. The loop reads the latest
// props through refs, so changing `state`, `level` or `colors` never restarts it; the look eases
// to the new state over about 300 ms instead. See ../README.md for the props and the Team map.
import { useEffect, useMemo, useRef, useState } from "react";
import { drawOrb } from "../services/drawOrb.ts";
import {
  DEFAULT_COLORS,
  STATE_PARAMS,
  easeParams,
  fakeLevel,
  orbScale,
  resolveColors,
  rmsLevel,
  smoothLevel,
  type OrbColors,
  type OrbParams,
  type OrbState,
} from "../services/orb.ts";

export type AgentOrbProps = {
  /** Width and height in CSS pixels. Works from 32 to 400. */
  size?: number;
  state?: OrbState;
  /** Live volume, 0 to 1. Used for listening and speaking when no `audio` is given. */
  level?: number;
  /** A microphone or playback stream, or an analyser you already have. Takes priority over `level`. */
  audio?: MediaStream | AnalyserNode | null;
  /** Three colours: the main tint, a light one and a cool one. Hex or rgb(). */
  colors?: OrbColors | readonly string[];
  className?: string;
};

/** Device pixels per CSS pixel, capped at 2: sharper than that costs fill time and isn't visible. */
const MAX_PIXEL_RATIO = 2;
/** A long pause (a hidden tab, a debugger) counts as one ordinary frame, so nothing leaps. */
const MAX_FRAME_MS = 50;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** An analyser for the given audio, or null. A MediaStream gets its own AudioContext, closed on cleanup. */
function useAnalyser(audio: AgentOrbProps["audio"]) {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  useEffect(() => {
    if (!audio) {
      setAnalyser(null);
      return;
    }
    if (typeof AnalyserNode !== "undefined" && audio instanceof AnalyserNode) {
      setAnalyser(audio);
      return;
    }
    if (typeof AudioContext === "undefined" || !(audio instanceof MediaStream) || audio.getAudioTracks().length === 0) {
      setAnalyser(null);
      return;
    }
    const context = new AudioContext();
    const source = context.createMediaStreamSource(audio);
    const node = context.createAnalyser();
    node.fftSize = 256;
    // The orb does its own smoothing; the analyser's would only add lag.
    node.smoothingTimeConstant = 0;
    // Not connected to the speakers: the orb only listens, so a microphone never echoes.
    source.connect(node);
    // A context made before any click may start suspended; the stream's user gesture usually allows this.
    context.resume().catch(() => undefined);
    setAnalyser(node);
    return () => {
      source.disconnect();
      context.close().catch(() => undefined);
    };
  }, [audio]);
  return analyser;
}

export default function AgentOrb({ size = 160, state = "idle", level, audio = null, colors = DEFAULT_COLORS, className }: AgentOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const analyser = useAnalyser(audio);
  const colorKey = colors.join("|");
  // Keyed on the colours' text, so a new array with the same colours doesn't re-parse or redraw.
  const palette = useMemo(() => resolveColors(colors), [colorKey]);
  const pixelSize = Math.max(16, Math.round(size));

  // The loop reads these, so prop changes reach it without restarting it.
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  const paletteRef = useRef(palette);
  const analyserRef = useRef(analyser);
  stateRef.current = state;
  levelRef.current = level;
  paletteRef.current = palette;
  analyserRef.current = analyser;

  // Reduced motion: one still frame in the state's colours and glow, redrawn when they change.
  useEffect(() => {
    if (!reducedMotion) return;
    const context = prepareCanvas(canvasRef.current, pixelSize);
    if (!context) return;
    drawOrb(context, pixelSize, { colors: palette, params: { ...STATE_PARAMS[state], breathe: 0 }, scale: 1, level: 0, phase: 0 });
  }, [reducedMotion, pixelSize, state, palette]);

  // The moving orb. Restarts only for a new size or a motion-preference change.
  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    const context = prepareCanvas(canvas, pixelSize);
    if (!canvas || !context) return;

    let params: OrbParams = { ...STATE_PARAMS[stateRef.current] };
    let smoothed = 0;
    let phase = 0;
    let seconds = 0;
    let last = 0;
    let frameId = 0;
    let onScreen = true;
    let samples = new Uint8Array(0);

    function rawLevel() {
      const node = analyserRef.current;
      if (node) {
        if (samples.length !== node.fftSize) samples = new Uint8Array(node.fftSize);
        node.getByteTimeDomainData(samples);
        return rmsLevel(samples);
      }
      const given = levelRef.current;
      if (typeof given === "number") return given;
      return fakeLevel(seconds);
    }

    function frame(now: number) {
      let elapsed = 0;
      if (last > 0) elapsed = Math.min(now - last, MAX_FRAME_MS);
      last = now;
      seconds += elapsed / 1000;
      params = easeParams(params, STATE_PARAMS[stateRef.current], elapsed);
      smoothed = smoothLevel(smoothed, rawLevel(), elapsed);
      phase += (elapsed / 1000) * params.speed;
      drawOrb(context!, pixelSize, { colors: paletteRef.current, params, scale: orbScale(params, smoothed, seconds), level: smoothed, phase });
      frameId = requestAnimationFrame(frame);
    }

    function start() {
      if (frameId !== 0 || document.hidden || !onScreen) return;
      last = 0;
      frameId = requestAnimationFrame(frame);
    }

    function stop() {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }

    // Pause while the tab is hidden or the orb is scrolled out of view, so a map full of orbs stays cheap.
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        if (onScreen) {
          start();
        } else {
          stop();
        }
      });
      observer.observe(canvas);
    }
    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, [pixelSize, reducedMotion]);

  let classes = "agent-orb";
  if (className) classes = `agent-orb ${className}`;
  // Decorative: the agent's name and status belong in text next to it.
  return <canvas ref={canvasRef} className={classes} width={pixelSize} height={pixelSize} style={{ width: pixelSize, height: pixelSize }} data-state={state} aria-hidden="true" />;
}

/** Sizes the backing store for the screen's pixel ratio and returns a context drawing in CSS pixels. */
function prepareCanvas(canvas: HTMLCanvasElement | null, size: number) {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  canvas.width = Math.round(size * ratio);
  canvas.height = Math.round(size * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}
