"use client";

// The orchestrator's orb: the voice orb (VoiceOrb, by UV, MIT) in Mula's mint, driven by the same
// props as AgentOrb so the chats and My agents can use either. While speaking it follows the chat's
// playback analyser; with no analyser (for example a reply read before audio started) it moves
// with a simulated voice, as AgentOrb's stand-in wave did.
import { useMemo } from "react";
import { AnalyserLevels, SimulatedVoice } from "../voice/audio.ts";
import type { OrbState } from "../services/orb.ts";
import { voiceOrbState } from "../services/voiceOrb.ts";
import VoiceOrb from "./VoiceOrb";

export type OrchestratorOrbProps = {
  /** Width and height in CSS pixels. */
  size?: number;
  state?: OrbState;
  /** The speech playback analyser, read while speaking. */
  audio?: AnalyserNode | null;
  className?: string;
};

export default function OrchestratorOrb({ size = 160, state = "idle", audio = null, className }: OrchestratorOrbProps) {
  // One reader per analyser: a level source keeps its own envelope, so it isn't shared.
  const heard = useMemo(() => {
    if (!audio) return null;
    return new AnalyserLevels(audio);
  }, [audio]);
  const simulated = useMemo(() => new SimulatedVoice(1, 0.8), []);
  let voice: AnalyserLevels | SimulatedVoice = simulated;
  if (heard) voice = heard;
  return <VoiceOrb palette="mint" state={voiceOrbState(state)} voice={voice} size={`${size}px`} className={className} />;
}
