# Mula agent art — handoff

Direction chosen: **Bubble Bots + orb orchestrator** (smooth vector, flat, original characters).
Source design: Claude Design canvas "Mula — Agent Art Style", boards 17 (team map) and 18 (lineup).

## Files
- `svg/*.svg` — five self-contained animated SVGs (CSS animation embedded). Orchestrator, finance, sales, inventory, support. Native size 240; viewBox is 120x120, `overflow: visible` (the orchestrator's rings reach outside the box, leave ~12% padding).
- `agents.css` — the shared keyframes (same CSS that is embedded in each SVG). Use it if you inline the SVGs as components instead of `<img>`.
- `tokens.json` — colours, per-agent hue/shape.
- `preview.html` — open in a browser to see all five.

## Anatomy of an agent bubble
- Flat blob body, one fill colour, no outline. One soft white highlight (ellipse, 40% opacity, rotated -28deg) at the upper left.
- Face: two ink (#0B0B0C) dot eyes r=5, a 2.8px ink smile (stroke-linecap round), two cheek ellipses in the agent's deep tone at 35% opacity.
- No satellite: agents have nothing orbiting them (removed 20 November 2026; earlier versions had a paper role mark circling each body).
- Ground shadow: black ellipse, scales with the float.

## Agents
| Agent | Shape | Fill | Cheek tone |
|---|---|---|---|
| Finance | egg (tall) | #FFE14A | #D9A800 |
| Sales | round | #FF9B7A | #D9533A |
| Inventory | squircle | #8FD3FF | #3C8FD0 |
| Support | cloud | #B8A6FF | #6B55D6 |
| Orchestrator | orb | #7AE8B4 (#D5FBE9 to #2FA878 radial); two drifting dashed rings, star core | n/a |

Mint is reserved for the orchestrator.

## Motion
- Float/squash: 3.4 s ease-in-out loop, translateY -5px, scale (.97, 1.04), origin at the bottom. Offset each agent by ~0.6 s.
- Blink: 4.6 s loop, scaleY to 0.1 at 94%.
- Eye glance: 6 s loop, translateX +/-3px.
- Orb: breathe 4 s, rings spin 18 s and 26 s (opposite directions), star twinkle 3.6 s, glow pulse 4 s.
- Honour `prefers-reduced-motion` (agents.css already disables all animation).

## My team page (layout)
Orchestrator orb card at top centre, a vertical line down to a horizontal bus, four agent cards below, one per agent, connected by 2px #3A3A3F lines. Cards: 16px radius, #161618 fill, 1px #2A2A2E border, agent name 15px/600 white, status line 12px #8A8A8F with a 6px dot (mint = working, gray = idle). When the orchestrator hands out work, a mint 8px dot with glow travels down the line, along the bus, then down to the agent card (4.8 s loop, staggered).

## Rules for adding an agent
New agent = new blob outline + new hue. No satellite or other orbiting mark. Same eye size, same smile, same float timing. Never reuse mint.

## Brand
Ink #0B0B0C, Paper #F4F4F0, Mint #7AE8B4. Display font Unbounded 700 (logo only), UI font Inter Tight.
