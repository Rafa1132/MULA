/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 * Adapted for Mula: from src/data/orb.ts, keeping the types, palettes and defaults (the demo
 * page's copy is left out) and adding the orchestrator's mint palette.
 */

/**
 * The voice orb's palettes, types and states.
 *
 * Each palette is four stops, deep to light, plus a glint: a neighbouring hue the shader only lets
 * in at the brightest points, which is what keeps a one-hue orb from reading flat. A stop is a hex,
 * or a custom property name the renderer resolves off :root.
 */

export type OrbVariant = "painted" | "glass" | "silk" | "halftone";

export type VoiceOrbState = "dormant" | "ready" | "connecting" | "listening" | "talking" | "settled";

export type OrbPaletteId = "mint" | "twilight" | "sunset" | "lagoon" | "forest" | "midnight";

/** deep, mid, light, glint. */
export type OrbStops = [string, string, string, string];

export interface OrbPalette {
  id: OrbPaletteId;
  name: string;
  stops: OrbStops;
}

export const ORB_PALETTES: OrbPalette[] = [
  // Mula's own: the orchestrator ramp from docs/design/agent-art/tokens.json (mint is reserved for
  // the orchestrator), with an aqua glint from the neighbouring hue.
  { id: "mint", name: "Mint", stops: ["#2fa878", "#7ae8b4", "#d5fbe9", "#c4fff1"] },
  { id: "twilight", name: "Twilight", stops: ["#4a3aff", "#8a7fff", "#d2cfff", "#f6c9ff"] },
  { id: "sunset", name: "Sunset", stops: ["#55206e", "#e8566c", "#ffab73", "#ffe6a6"] },
  { id: "lagoon", name: "Lagoon", stops: ["#003f86", "#018dff", "#8fd2ff", "#c4fff1"] },
  { id: "forest", name: "Forest", stops: ["#0b5134", "#1da463", "#93e2b6", "#fff0b8"] },
  { id: "midnight", name: "Midnight", stops: ["#080064", "#4a3aff", "#bfbaff", "#ffffff"] },
];

/** The tunable look parameters. */
export interface OrbParams {
  speed: number;
  warp: number;
  sphere: number;
  detail: number;
  grain: number;
  pulse: number;
  highlight: number;
  exposure: number;
  saturation: number;
  /** How far the voice's liquid carries the colour (fluid.ts); 0 turns it off. */
  fluid: number;
}

export const ORB_PARAM_DEFAULTS: OrbParams = {
  speed: 1,
  warp: 0.8,
  sphere: 0.85,
  detail: 1.1,
  grain: 0.22,
  pulse: 0.6,
  highlight: 0.7,
  exposure: 0,
  saturation: 1,
  fluid: 0.7,
};

/** A palette's stops by id, or the first palette's for an unknown id. */
export function paletteStops(id: OrbPaletteId): OrbStops {
  const palette = ORB_PALETTES.find((item) => item.id === id);
  if (palette) return palette.stops;
  return ORB_PALETTES[0].stops;
}
