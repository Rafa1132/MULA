// How Mula's orb states map onto the voice orb's (components/VoiceOrb.tsx). The chat reports four
// states (services/orb.ts); the voice orb has six, and Mula uses four of them.
import type { OrbState } from "./orb.ts";
import type { VoiceOrbState } from "../voice/params.ts";

const VOICE_STATES: Record<OrbState, VoiceOrbState> = {
  idle: "ready",
  listening: "listening",
  // A reply on its way: the voice orb's waiting state, with its faster drift and circling highlight.
  thinking: "connecting",
  speaking: "talking",
};

/** The voice orb state for a Mula orb state; anything unknown reads as idle ("ready"). */
export function voiceOrbState(state: OrbState): VoiceOrbState {
  const mapped = VOICE_STATES[state];
  if (mapped) return mapped;
  return "ready";
}
