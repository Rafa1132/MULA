# Agent art direction

This is Mula's art direction for agents from 20 November 2026: **bubble bots plus an orb orchestrator**. The files here are the design handoff as delivered (`AGENTS-ART.md` is the brief; `tokens.json`, `agents.css`, `preview.html` and `svg/`). Open `preview.html` in a browser to see the five characters.

## How the app uses it

| Agent in the app | Character | Where it comes from |
|---|---|---|
| Operator (the orchestrator) | The voice orb, in mint | `src/features/orb` (`OrchestratorOrb`, the voice orb by UV), not `svg/orchestrator.svg`: the orb reacts to the agent's voice and state |
| Forecasting | The Finance bot (yellow egg, coin ring) | `public/agents/finance.svg` |
| An agent with the id `finance`, `sales`, `inventory` or `support` | That bot | `public/agents/<id>.svg` |
| Any other agent | Its initial on a neutral disc, until it has its own bot | `src/features/team/services/avatar.ts` |

- The bots are shown as `<img>`, so the CSS inside each SVG (including its reduced-motion rule) stays inside the image and can't reach the page.
- The chat screen (`src/features/chat`) is the orchestrator's, so its accent is the brand mint, which the brief reserves for the orchestrator.

## Not applied yet

The brand colours and fonts in the brief (ink `#0B0B0C`, paper `#F4F4F0`, Inter Tight for the interface, Unbounded for the logo) and the My Team layout it describes (the orb card at the top, a bus line to the agent cards, travelling mint dots) are the direction for later changes. The rest of the app still uses its current tokens and the free-form map.

## Adding an agent

Follow "Rules for adding an agent" in `AGENTS-ART.md`: a new blob outline and a new hue (no satellite), with the same eyes, smile and float timing, and never mint. Put its SVG in `public/agents/` and add its id to `BOTS` in `src/features/team/services/avatar.ts`.
