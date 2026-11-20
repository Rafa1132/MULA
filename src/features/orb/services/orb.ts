// The orb's logic without any drawing: colours, the four states' look, smoothing, and the
// maths for how the blobs move. Pure functions, so they are tested in Node (tests/orb.test.mjs).

export const ORB_STATES = ["idle", "listening", "thinking", "speaking"] as const;
export type OrbState = (typeof ORB_STATES)[number];

export type Rgb = { r: number; g: number; b: number };
export type OrbColors = readonly [string, string, string];

/** Soft mint, white and a light grey-blue: reads on a light page and on a dark one. */
export const DEFAULT_COLORS: OrbColors = ["#9FE8C8", "#FFFFFF", "#B7C6D9"];

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

// ---------------------------------------------------------------- colours

/** Reads "#rgb", "#rrggbb", "rgb(r, g, b)" or "rgba(r, g, b, a)". Anything else is null. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) {
      digits = digits.split("").map((digit) => digit + digit).join("");
    }
    return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16) };
  }
  const functional = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(text);
  if (functional) {
    return { r: clamp(Number(functional[1]), 0, 255), g: clamp(Number(functional[2]), 0, 255), b: clamp(Number(functional[3]), 0, 255) };
  }
  return null;
}

/** The three colours as numbers; a colour that can't be read falls back to the default in its slot. */
export function resolveColors(colors: readonly string[]): [Rgb, Rgb, Rgb] {
  const resolved: Rgb[] = [];
  for (let index = 0; index < 3; index += 1) {
    const fallback = parseColor(DEFAULT_COLORS[index]) as Rgb;
    const given = colors[index];
    if (typeof given === "string") {
      resolved.push(parseColor(given) ?? fallback);
    } else {
      resolved.push(fallback);
    }
  }
  return [resolved[0], resolved[1], resolved[2]];
}

export function mixColor(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = clamp01(amount);
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

export function rgba(color: Rgb, alpha: number) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${clamp01(alpha).toFixed(3)})`;
}

function toHex(color: Rgb) {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/**
 * A three-colour palette built from one tint, for tinting each agent's orb: the tint itself, white,
 * and the tint pulled toward grey-blue so the blobs still blend. An unreadable tint gives the default.
 */
export function paletteFromColor(tint: string): [string, string, string] {
  const base = parseColor(tint);
  if (base === null) return [...DEFAULT_COLORS];
  const greyBlue = parseColor(DEFAULT_COLORS[2]) as Rgb;
  return [toHex(base), toHex(WHITE), toHex(mixColor(base, greyBlue, 0.6))];
}

// ----------------------------------------------------------------- states

/** How the orb looks and moves in one state. Every field is eased, so a state change never snaps. */
export type OrbParams = {
  speed: number;       // blob drift, in phase units per second
  orbit: number;       // how far the blobs travel, as a fraction of the radius
  breathe: number;     // the idle breathing: how much bigger the orb gets at its fullest
  brightness: number;  // a white wash over the fill, 0 to 1
  glow: number;        // the halo and rim light at rest, 0 to 1
  glowGain: number;    // extra glow that follows the audio level
  scaleGain: number;   // extra size that follows the audio level
  shift: number;       // how far the glow colour wanders between the palette's first and third colour
};

export const STATE_PARAMS: Record<OrbState, OrbParams> = {
  // Very slow drift and a 2 percent breath.
  idle: { speed: 0.12, orbit: 0.3, breathe: 0.02, brightness: 0, glow: 0.45, glowGain: 0, scaleGain: 0, shift: 0 },
  // A little brighter, and the size and glow follow the microphone.
  listening: { speed: 0.22, orbit: 0.32, breathe: 0, brightness: 0.12, glow: 0.6, glowGain: 0.25, scaleGain: 0.05, shift: 0 },
  // The blobs swirl faster and wider and the glow colour drifts; the size never changes.
  thinking: { speed: 0.85, orbit: 0.42, breathe: 0, brightness: 0.04, glow: 0.55, glowGain: 0, scaleGain: 0, shift: 1 },
  // The size and glow follow the audio the agent is playing.
  speaking: { speed: 0.35, orbit: 0.34, breathe: 0, brightness: 0.08, glow: 0.6, glowGain: 0.5, scaleGain: 0.12, shift: 0 },
};

/** Time constant of the state transitions: about 95 percent of the way there after three of these (300 ms). */
export const TRANSITION_MS = 100;
/** Time constant of the level smoothing: quick enough to feel live, slow enough not to jitter. */
export const LEVEL_SMOOTHING_MS = 90;

/** Moves `current` toward `target` by an exponential ease. The same curve at any frame rate. */
export function easeToward(current: number, target: number, elapsedMs: number, timeConstantMs = TRANSITION_MS) {
  if (!(elapsedMs > 0)) return current;
  const share = 1 - Math.exp(-elapsedMs / timeConstantMs);
  return current + (target - current) * share;
}

export function easeParams(current: OrbParams, target: OrbParams, elapsedMs: number): OrbParams {
  return {
    speed: easeToward(current.speed, target.speed, elapsedMs),
    orbit: easeToward(current.orbit, target.orbit, elapsedMs),
    breathe: easeToward(current.breathe, target.breathe, elapsedMs),
    brightness: easeToward(current.brightness, target.brightness, elapsedMs),
    glow: easeToward(current.glow, target.glow, elapsedMs),
    glowGain: easeToward(current.glowGain, target.glowGain, elapsedMs),
    scaleGain: easeToward(current.scaleGain, target.scaleGain, elapsedMs),
    shift: easeToward(current.shift, target.shift, elapsedMs),
  };
}

// ------------------------------------------------------------------ audio

/** An exponential moving average of the level, so one loud frame doesn't make the orb jump. */
export function smoothLevel(previous: number, raw: number, elapsedMs: number) {
  return clamp01(easeToward(previous, clamp01(raw), elapsedMs, LEVEL_SMOOTHING_MS));
}

/**
 * The loudness of one analyser frame, 0 to 1. `samples` are the bytes from getByteTimeDomainData,
 * where 128 is silence. Speech sits around 0.05 to 0.2 RMS, so it is scaled up to use the range.
 */
export function rmsLevel(samples: ArrayLike<number>) {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centred = (samples[index] - 128) / 128;
    sum += centred * centred;
  }
  return clamp01(Math.sqrt(sum / samples.length) * 4);
}

/** A stand-in for audio when none is given: two slow sines, so demos still look alive. 0 to 1. */
export function fakeLevel(seconds: number) {
  const wave = 0.5 + 0.28 * Math.sin(seconds * 2.3) + 0.22 * Math.sin(seconds * 5.1 + 1.3);
  return clamp01(wave);
}

// ---------------------------------------------------------------- motion

const BREATH_SECONDS = 5;

/** The orb's size as a multiple of its resting size. Thinking has no breath and no gain, so it stays at 1. */
export function orbScale(params: OrbParams, level: number, seconds: number) {
  const breath = 0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / BREATH_SECONDS);
  return 1 + params.breathe * breath + params.scaleGain * clamp01(level);
}

/** Where blob `index` is, in radii from the centre. Each blob has its own rates, so they never line up. */
export function blobPosition(index: number, phase: number, orbit: number) {
  const rates = [
    [1.0, 0.8, 0, 1.7],
    [0.7, 1.1, 2.1, 0.4],
    [0.9, 0.6, 4.2, 3.3],
  ];
  const [xRate, yRate, xOffset, yOffset] = rates[index % rates.length];
  return { x: orbit * Math.cos(phase * xRate + xOffset), y: orbit * Math.sin(phase * yRate + yOffset) };
}
