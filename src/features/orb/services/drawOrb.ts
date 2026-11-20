// Paints one frame of the orb on a 2D canvas. Everything is measured in fractions of the radius,
// so the orb looks the same at 32 px and at 400 px. Only radial and linear gradients are used:
// they are soft by nature, so no canvas `filter: blur()` is needed, which keeps a frame cheap.
import { blobPosition, clamp01, mixColor, rgba, type OrbParams, type Rgb } from "./orb.ts";

export type OrbFrame = {
  colors: [Rgb, Rgb, Rgb];
  params: OrbParams;
  scale: number;  // from orbScale
  level: number;  // the smoothed audio level, 0 to 1
  phase: number;  // accumulated drift; grows faster when the state's speed is higher
};

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
/** The orb's resting radius, as a share of the canvas. The rest is room for the halo and for growing. */
const RADIUS_SHARE = 0.4;
// Per colour slot: the main tint is the largest and strongest, the light one the smallest.
const BLOB_SIZES = [0.92, 0.6, 0.72];
const BLOB_STRENGTH = [0.95, 0.7, 0.75];
// Drawn light, then cool, then the main tint, so the tint stays on top and reads as the orb's colour.
const BLOB_ORDER = [1, 2, 0];

/** `size` is the canvas size in CSS pixels; the context is already scaled for the device pixel ratio. */
export function drawOrb(context: CanvasRenderingContext2D, size: number, frame: OrbFrame) {
  const { colors, params, scale, level, phase } = frame;
  const centre = size / 2;
  const radius = size * RADIUS_SHARE * scale;
  const glow = clamp01(params.glow + params.glowGain * level);
  // While thinking the glow colour drifts slowly between the first and third colour.
  const glowColor = mixColor(colors[0], colors[2], params.shift * (0.5 + 0.5 * Math.sin(phase * 0.6)));

  context.clearRect(0, 0, size, size);

  // Faint outer halo, drawn before the clip. It fades out by the canvas edge.
  const haloEnd = Math.min(radius * 1.3, centre);
  const halo = context.createRadialGradient(centre, centre, radius * 0.85, centre, centre, haloEnd);
  halo.addColorStop(0, rgba(glowColor, 0.5 * glow));
  halo.addColorStop(0.5, rgba(glowColor, 0.16 * glow));
  halo.addColorStop(1, rgba(glowColor, 0));
  context.fillStyle = halo;
  context.fillRect(0, 0, size, size);

  context.save();
  context.beginPath();
  context.arc(centre, centre, radius, 0, Math.PI * 2);
  context.clip();

  // The glass: a light gradient between the second and third colour that turns slowly.
  const angle = phase * 0.15;
  const dx = Math.cos(angle) * radius;
  const dy = Math.sin(angle) * radius;
  const base = context.createLinearGradient(centre - dx, centre - dy, centre + dx, centre + dy);
  base.addColorStop(0, rgba(mixColor(colors[1], colors[0], 0.3), 1));
  base.addColorStop(1, rgba(colors[2], 1));
  context.fillStyle = base;
  context.fillRect(centre - radius, centre - radius, radius * 2, radius * 2);

  // The light moving inside: three soft blobs, one per colour, blending where they overlap.
  for (const index of BLOB_ORDER) {
    const position = blobPosition(index, phase, params.orbit);
    const x = centre + position.x * radius;
    const y = centre + position.y * radius;
    const blobRadius = radius * BLOB_SIZES[index];
    const blob = context.createRadialGradient(x, y, 0, x, y, blobRadius);
    blob.addColorStop(0, rgba(colors[index], BLOB_STRENGTH[index]));
    blob.addColorStop(0.55, rgba(colors[index], BLOB_STRENGTH[index] * 0.5));
    blob.addColorStop(1, rgba(colors[index], 0));
    context.fillStyle = blob;
    context.fillRect(centre - radius, centre - radius, radius * 2, radius * 2);
  }

  // Listening and speaking are a touch brighter.
  if (params.brightness > 0.001) {
    context.fillStyle = rgba(WHITE, params.brightness);
    context.fillRect(centre - radius, centre - radius, radius * 2, radius * 2);
  }

  // A soft shade low on the sphere gives it volume.
  const shade = context.createRadialGradient(centre + radius * 0.2, centre + radius * 0.95, 0, centre + radius * 0.2, centre + radius * 0.95, radius * 0.85);
  shade.addColorStop(0, rgba(colors[2], 0.3));
  shade.addColorStop(1, rgba(colors[2], 0));
  context.fillStyle = shade;
  context.fillRect(centre - radius, centre - radius, radius * 2, radius * 2);

  // Inner glow along the rim, in place of an outline.
  const rim = context.createRadialGradient(centre, centre, radius * 0.6, centre, centre, radius);
  rim.addColorStop(0, rgba(WHITE, 0));
  rim.addColorStop(1, rgba(mixColor(glowColor, WHITE, 0.45), 0.55 * glow));
  context.fillStyle = rim;
  context.fillRect(centre - radius, centre - radius, radius * 2, radius * 2);

  // The glass highlight, up and to the left.
  const hx = centre - radius * 0.32;
  const hy = centre - radius * 0.38;
  const highlight = context.createRadialGradient(hx, hy, 0, hx, hy, radius * 0.55);
  highlight.addColorStop(0, rgba(WHITE, 0.42));
  highlight.addColorStop(1, rgba(WHITE, 0));
  context.fillStyle = highlight;
  context.fillRect(centre - radius, centre - radius, radius * 2, radius * 2);

  context.restore();
}
