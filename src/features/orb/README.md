# Agent orb

The orchestrator wears the **voice orb** (since 20 November 2026). The earlier canvas orb, `AgentOrb`, is kept and is described further down.

## The voice orb (the orchestrator's orb)

A WebGL2 shader ball, copied from [Voice orb by UV](https://github.com/imuvrays1/voice-orb) (MIT; the licence is in `voice/LICENSE`, and every copied file keeps its notice). It is a painted colour field wrapped onto a sphere, drifting on layered noise, with film grain. While the agent speaks, its voice drives a small fluid simulation, rings that travel through the colour and a highlight near the rim.

- `components/OrchestratorOrb.tsx`: Mula's wrapper. It takes the same `size`, `state` and `audio` (an `AnalyserNode`) as `AgentOrb`, draws the voice orb in the **mint** palette (the orchestrator ramp from `docs/design/agent-art/tokens.json`), and reads the chat's playback analyser while speaking. With no analyser it moves with a simulated voice.
- `services/voiceOrb.ts`: maps Mula's states onto the voice orb's: idle → ready, listening → listening, thinking → connecting (faster drift and a circling highlight), speaking → talking.
- `components/VoiceOrb.tsx`, `voice-orb.css`: the component (states, easing, clocks) and its box, with a still CSS gradient where WebGL2 is missing.
- `voice/renderer.ts`: one hidden WebGL2 context draws every orb on the page and copies each frame into that orb's canvas. It draws only on-screen orbs, stops in a hidden tab, holds a still frame under reduced motion, and survives a lost GPU context.
- `voice/shaders.ts`, `voice/fluid.ts`, `voice/audio.ts`, `voice/params.ts`: the shaders (painted, glass, silk, halftone), the 128 × 128 fluid, the four calibrated frequency bands and a simulated voice, and the palettes and defaults.

Changes from the original: conditional expressions are written as `if`/`else` (this repository's rule); constructor parameter properties are plain fields, so `npm test` can load the files; plain CSS classes instead of a CSS module; and the artwork type, the demo page's copy and the microphone, element and tab-audio helpers are left out. No image assets, no new dependency.

The `/orb` demo shows the voice orb first, in each state (speaking uses the simulated voice there), with `AgentOrb` below it.

## AgentOrb (the earlier orb)

A soft, glowing orb that shows what an agent is doing. It's a glass-like sphere with three blurred colour blobs drifting inside it, an inner glow and a faint halo. There is no outline and no text. It draws on one `<canvas>` with one `requestAnimationFrame` loop and uses no animation library.

- `components/AgentOrb.tsx`: the component.
- `components/OrbDemo.tsx`: the demo at **`/orb`**, which needs no account or backend. It has state buttons, a level slider, a fake-wave switch, the microphone, every size, and per-agent tints.
- `services/orb.ts`: everything that isn't drawing: colours, the four states, easing, level smoothing and blob motion. All pure and tested.
- `services/drawOrb.ts`: paints one frame.

## Use

```tsx
import { AgentOrb, paletteFromColor } from "@/features/orb";
import "@/features/orb/orb.css"; // only `.agent-orb { display: block }`; optional

<AgentOrb />                                             // 160 px, idle, mint
<AgentOrb size={48} state="thinking" />
<AgentOrb state="speaking" level={volume} />             // your own 0–1 level
<AgentOrb state="listening" audio={micStream} />         // a MediaStream or an AnalyserNode
<AgentOrb colors={paletteFromColor("#5bb5d8")} />        // one tint → three colours
```

| Prop | Default | |
|---|---|---|
| `size` | `160` | Width and height in CSS pixels. Everything is drawn in fractions of the radius, so it looks the same from 32 to 400. |
| `state` | `"idle"` | `idle`, `listening`, `thinking` or `speaking`. |
| `level` | none | Live volume, 0 to 1. Leave it out, with no `audio`, to get a sine-based stand-in so demos still move. |
| `audio` | `null` | A `MediaStream` (the orb makes its own `AudioContext` and closes it on unmount) or an `AnalyserNode` you already have. It takes priority over `level`. It is never connected to the speakers, so a microphone doesn't echo. |
| `colors` | `["#9FE8C8", "#FFFFFF", "#B7C6D9"]` | Three colours: the main tint, a light one and a cool one, as hex or `rgb()`. An unreadable colour falls back to the default in its slot. |
| `className` | none | Added to the canvas. |

## States

| State | Look |
|---|---|
| `idle` | Very slow drift and a 2 percent breath (5 s). Ignores the level. |
| `listening` | A little brighter. The size (up to +5 %) and glow follow the level. |
| `thinking` | The blobs swirl faster and wider, and the glow colour drifts between the first and third colour. It never scales. |
| `speaking` | The size (up to +12 %) and glow follow the level. |

Every look value eases with a 100 ms time constant, so a state change is about 95 % done after 300 ms and never snaps. The level is an exponential moving average (90 ms), so one loud frame only nudges it.

## Behaviour

- **Cost:** gradients only, no canvas `filter: blur()`. The backing store is capped at 2× the device pixel ratio. The headless check holds 61 fps with eight orbs on the page.
- **Pauses** while the tab is hidden and while the orb is scrolled out of view (IntersectionObserver). On return it picks up where it left off, without a jump.
- **`prefers-reduced-motion: reduce`:** a still orb in the state's colours and glow, redrawn only when the state or colours change.
- **Decorative:** the canvas is `aria-hidden` and has `data-state`. Put the agent's name and status in text beside it.
- Changing `state`, `level`, `colors` or `audio` never restarts the loop, because the loop reads them through refs. Only a new `size` or a change in motion preference restarts it.

## Where it is used

- **Chats** (`features/chat`, `ChatStage`): the workspace assistant and every project's Operator, as `OrchestratorOrb`. The state follows the chat (speaking while a reply is read aloud, with the playback `AnalyserNode` as `audio`; listening during dictation or live conversation; thinking while a reply is on its way).
- **My agents** (`features/team`, `AgentAvatar`): the Operator, the orchestrator, is `OrchestratorOrb` on its card, in its settings and in the panel heading, at `state="idle"` (the map has no live activity signal yet). Every orb on the page shares one WebGL context.
- `AgentOrb` itself is now used only on `/orb`. Other agents are bubble bots, not tinted orbs, per the art direction in `docs/design/agent-art/`, which reserves mint for the orchestrator.
- **Zoom:** the map scales cards with one CSS transform. The canvas is drawn at up to 2× pixel density, so it stays sharp to about 2× zoom on a normal screen and to 1× on a Retina one.

## Tests

- `tests/voiceOrb.test.mjs` (in `npm test`) covers the state mapping, the mint palette, colour parsing, the simulated voice's range, and the analyser bands' calibration with a fake `AnalyserNode`. The shaders, fluid and renderer need a GPU and are checked by eye on `/orb`.
- `tests/orb.test.mjs` (in `npm test`) covers colour parsing and fallbacks, `paletteFromColor`, the 300 ms easing without overshoot, level smoothing, RMS from analyser bytes, the fake wave's range, each state's size rules (idle ≤ 2 %, thinking exactly 1, speaking grows) and blob bounds.
- `tests/browser.spec.mjs` is an optional Playwright check of `AgentOrb` against `/orb` (needs `MULA_TEST_URL`). It measures the radius from the canvas pixels to check the idle breath, that speaking grows and eases through in-between frames, that the fake wave never jumps more than 2 px a frame, and that thinking holds its size. It also checks the frame rate with eight orbs, the offscreen pause, keyboard use, reduced motion and phone width.
