"use client";

// The demo at /orb: switch states, drive the level by hand or with the microphone, and see the
// orb at every size and in each agent's tint. The orchestrator now wears the voice orb
// (OrchestratorOrb), shown first; AgentOrb, the earlier orb, is kept below it.
import { useEffect, useState } from "react";
import { ORB_STATES, paletteFromColor, type OrbState } from "../services/orb.ts";
import AgentOrb from "./AgentOrb";
import OrchestratorOrb from "./OrchestratorOrb";

const STATE_LABELS: Record<OrbState, string> = { idle: "Idle", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };
const SIZES = [32, 64, 160, 400];
// The orb is the orchestrator's character, and mint is reserved for it (docs/design/agent-art/).
// Other agents are bubble bots, not tinted orbs; the tints only show what `colors` does.
const TINTS = [
  { name: "Default", color: "#9FE8C8" },
  { name: "Brand mint", color: "#7AE8B4" },
  { name: "Deep mint", color: "#2FA878" },
];

export default function OrbDemo() {
  const [state, setState] = useState<OrbState>("idle");
  const [level, setLevel] = useState(0.4);
  const [fakeWave, setFakeWave] = useState(false);
  const [microphone, setMicrophone] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState("");

  // Stop the microphone when the page closes.
  useEffect(() => () => microphone?.getTracks().forEach((track) => track.stop()), [microphone]);

  async function toggleMicrophone() {
    setMicError("");
    if (microphone) {
      setMicrophone(null);
      return;
    }
    try {
      setMicrophone(await navigator.mediaDevices.getUserMedia({ audio: true }));
      setState("listening");
    } catch {
      setMicError("The microphone isn't available. Check the browser's permission for this page.");
    }
  }

  // Undefined lets the orb use its own sine wave; the slider gives an exact level.
  let orbLevel: number | undefined = level;
  if (fakeWave) orbLevel = undefined;
  let micLabel = "Use microphone";
  if (microphone) micLabel = "Stop microphone";

  return (
    <main className="orb-demo">
      <header>
        <h1>Agent orb</h1>
        <p>The orb each agent wears. Switch its state, set the level, or let it listen to your microphone.</p>
      </header>

      <section className="orb-demo-stage" aria-label="Preview">
        <OrchestratorOrb size={240} state={state} />
        <p className="orb-demo-status" aria-live="polite">State: {STATE_LABELS[state]}</p>
        <p className="orb-demo-hint">The orchestrator: Voice orb by <a href="https://github.com/imuvrays1/voice-orb" target="_blank" rel="noreferrer noopener">UV</a> (MIT), in mint. Speaking uses a simulated voice here.</p>
      </section>

      <section className="orb-demo-stage" aria-label="Earlier orb">
        <AgentOrb size={160} state={state} level={orbLevel} audio={microphone} />
        <p className="orb-demo-hint">The earlier orb (AgentOrb), kept for reference. The level and microphone below drive it.</p>
      </section>

      <section className="orb-demo-controls" aria-label="Controls">
        <div className="orb-demo-states" role="group" aria-label="State">
          {ORB_STATES.map((option) => (
            <button key={option} type="button" aria-pressed={state === option} onClick={() => setState(option)}>
              {STATE_LABELS[option]}
            </button>
          ))}
        </div>
        <label className="orb-demo-field">
          <span>Level: {Math.round(level * 100)}%</span>
          <input type="range" min={0} max={1} step={0.01} value={level} disabled={fakeWave || microphone !== null} onChange={(event) => setLevel(Number(event.target.value))} />
        </label>
        <label className="orb-demo-check">
          <input type="checkbox" checked={fakeWave} onChange={(event) => setFakeWave(event.target.checked)} />
          <span>Fake wave (no level given)</span>
        </label>
        <button type="button" onClick={toggleMicrophone}>{micLabel}</button>
        {micError && <p role="alert" className="orb-demo-error">{micError}</p>}
        <p className="orb-demo-hint">Level and microphone move the orb only while it is listening or speaking.</p>
      </section>

      <section aria-labelledby="orb-sizes">
        <h2 id="orb-sizes">Sizes</h2>
        <div className="orb-demo-row">
          {SIZES.map((size) => (
            <figure key={size}>
              <AgentOrb size={size} state={state} level={orbLevel} />
              <figcaption>{size} px</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section aria-labelledby="orb-tints">
        <h2 id="orb-tints">Per-agent tints</h2>
        <div className="orb-demo-row">
          {TINTS.map((tint) => (
            <figure key={tint.name}>
              <AgentOrb size={96} state={state} level={orbLevel} colors={paletteFromColor(tint.color)} />
              <figcaption>{tint.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
