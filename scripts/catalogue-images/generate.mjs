// Generates the Catalogue's proof-of-concept PNGs from SVG drawn in code.
//
//   node scripts/catalogue-images/generate.mjs
//
// It reads every path from src/features/catalogue/data.ts (card images, previews and the
// publisher avatar), draws each one, and overwrites only those files. It never deletes
// anything and refuses any path outside public/catalogue/. It fails if a file would be
// over 300 KB. Nothing is downloaded; no external image service is used.
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { CATALOGUE_ENTRIES, PUBLISHERS } from "../../src/features/catalogue/data.ts";
import { agentCard, appCard, mulaAvatar } from "./cards.mjs";
import { screensFor } from "./screens.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_ROOT = path.join(ROOT, "public", "catalogue");
const SIZE_LIMIT = 300 * 1024;

/** Map a public URL such as "/catalogue/todo/1.png" to a file, refusing anything outside public/catalogue/. */
function outputPath(publicUrl) {
  if (!publicUrl.startsWith("/catalogue/") || !publicUrl.endsWith(".png")) throw new Error(`Refusing to write ${publicUrl}: not a PNG under /catalogue/`);
  const file = path.resolve(ROOT, "public", "." + publicUrl);
  if (!file.startsWith(OUTPUT_ROOT + path.sep)) throw new Error(`Refusing to write ${publicUrl}: outside public/catalogue/`);
  return file;
}

/** Render SVG to PNG, trying lossless first and a 256-colour palette if that is too big. */
async function render(svgMarkup) {
  const input = Buffer.from(svgMarkup);
  const lossless = await sharp(input).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  if (lossless.length <= SIZE_LIMIT) return lossless;
  return sharp(input).png({ compressionLevel: 9, palette: true, quality: 95, colours: 256, dither: 0.6 }).toBuffer();
}

function jobs() {
  const list = [];
  for (const entry of CATALOGUE_ENTRIES) {
    if (entry.type === "agent") list.push({ url: entry.image, draw: () => agentCard(entry.id) });
    else list.push({ url: entry.image, draw: () => appCard(entry.id) });
    const screens = screensFor(entry.id);
    if (screens.length !== entry.screenshots.length) throw new Error(`${entry.id} lists ${entry.screenshots.length} previews but ${screens.length} are drawn`);
    entry.screenshots.forEach((shot, index) => list.push({ url: shot.src, draw: screens[index] }));
  }
  const mula = PUBLISHERS.find((publisher) => publisher.id === "mula");
  if (mula === undefined) throw new Error("No Mula publisher in data.ts");
  list.push({ url: mula.avatar, draw: mulaAvatar });
  return list;
}

async function main() {
  const results = [];
  for (const job of jobs()) {
    const file = outputPath(job.url);
    const png = await render(job.draw());
    if (png.length > SIZE_LIMIT) throw new Error(`${job.url} is ${Math.round(png.length / 1024)} KB, over the 300 KB limit`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, png);
    const { width, height } = await sharp(png).metadata();
    results.push({ url: job.url, width, height, kb: (await stat(file)).size / 1024 });
  }
  for (const result of results) console.log(`${result.url.padEnd(38)} ${`${result.width}×${result.height}`.padEnd(10)} ${result.kb.toFixed(1).padStart(6)} KB`);
  const total = results.reduce((sum, result) => sum + result.kb, 0);
  console.log(`\n${results.length} files, ${(total / 1024).toFixed(2)} MB in total`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
