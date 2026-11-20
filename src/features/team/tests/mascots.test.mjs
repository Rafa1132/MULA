import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The bubble bots the app shows (public/agents/) and the design handoff copies.
const BOTS = ["finance", "sales", "inventory", "support"];
const FOLDERS = ["public/agents", "docs/design/agent-art/svg"];

test("bubble bots have no orbiting satellite but keep float, blink, glance and reduced motion", () => {
  for (const folder of FOLDERS) {
    for (const bot of BOTS) {
      const svg = readFileSync(new URL(`../../../../${folder}/${bot}.svg`, import.meta.url), "utf8");
      const where = `${folder}/${bot}.svg`;
      assert.doesNotMatch(svg, /animation:spin/, where);
      assert.doesNotMatch(svg, /@keyframes spin/, where);
      for (const motion of ["animation:squish 3.4s", "animation:shadow 3.4s", "animation:blink 4.6s", "animation:look 6s"]) {
        assert.ok(svg.includes(motion), `${where} keeps ${motion}`);
      }
      assert.ok(svg.includes("@media (prefers-reduced-motion:reduce){*{animation:none!important}}"), where);
    }
  }
});
