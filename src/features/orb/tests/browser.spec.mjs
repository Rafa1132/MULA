// Optional Playwright check of the agent orb on /orb. Needs only the client running (MULA_TEST_URL);
// the page uses no backend. It measures the orb's radius from the canvas pixels to check each state.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

// Installed in the page: the main orb's radius in CSS pixels, read where the sphere turns opaque
// (the halo outside it is faint), and a sampler that records it on every animation frame.
async function installProbes(page) {
  await page.evaluate(() => {
    window.orbRadius = () => {
      const canvas = document.querySelector(".orb-demo-stage canvas");
      const width = canvas.width;
      const row = canvas.getContext("2d").getImageData(0, Math.floor(width / 2), width, 1).data;
      for (let x = 0; x < width; x += 1) {
        if (row[x * 4 + 3] > 240) return ((width / 2 - x) * 240) / width;
      }
      return 0;
    };
    window.sampleRadius = (ms) => new Promise((resolve) => {
      const values = [];
      const end = performance.now() + ms;
      function step(now) {
        values.push(window.orbRadius());
        if (now < end) {
          requestAnimationFrame(step);
        } else {
          resolve(values);
        }
      }
      requestAnimationFrame(step);
    });
  });
}

const spread = (values) => Math.max(...values) - Math.min(...values);

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(baseURL + "/orb");
  await page.getByRole("heading", { name: "Agent orb" }).waitFor();
  await installProbes(page);
  const state = page.getByRole("group", { name: "State" });
  const level = page.getByLabel(/Level/);

  // Idle: breathes about 2 percent of a 96 px radius, so at most about 2 px, and ignores the level.
  await level.fill("1");
  const idle = await page.evaluate(() => window.sampleRadius(2600));
  assert.ok(spread(idle) <= 2.5, `idle spread ${spread(idle)}`);
  assert.ok(Math.min(...idle) >= 95, `idle radius ${Math.min(...idle)}`);

  // Speaking at full level: it grows, and the change eases over frames instead of snapping.
  const before = await page.evaluate(() => window.orbRadius());
  await state.getByRole("button", { name: "Speaking" }).click();
  const easing = await page.evaluate(() => window.sampleRadius(700));
  const after = easing.at(-1);
  assert.ok(after - before >= 8, `speaking at level 1 grows: ${before} → ${after}`);
  const between = easing.filter((value) => value > before + 1 && value < after - 1);
  assert.ok(between.length >= 3, `eases through ${between.length} in-between frames`);
  const biggestStep = Math.max(...easing.slice(1).map((value, index) => Math.abs(value - easing[index])));
  assert.ok(biggestStep < (after - before) / 2, `no snap: largest one-frame step ${biggestStep}`);

  // Speaking with the fake wave: it moves, smoothly.
  await page.getByLabel("Fake wave (no level given)").check();
  const wave = await page.evaluate(() => window.sampleRadius(1500));
  assert.ok(spread(wave) >= 3, `the fake wave moves the orb: ${spread(wave)}`);
  const waveStep = Math.max(...wave.slice(1).map((value, index) => Math.abs(value - wave[index])));
  assert.ok(waveStep <= 2, `no jitter: largest one-frame step ${waveStep}`);
  await page.getByLabel("Fake wave (no level given)").uncheck();

  // Thinking never scales, whatever the level, but the blobs keep moving.
  await state.getByRole("button", { name: "Thinking" }).click();
  await page.waitForTimeout(700);
  const thinking = await page.evaluate(() => window.sampleRadius(1200));
  assert.ok(spread(thinking) <= 0.5, `thinking spread ${spread(thinking)}`);
  const stage = page.locator(".orb-demo-stage canvas");
  const firstFrame = await stage.evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(200);
  assert.notEqual(await stage.evaluate((canvas) => canvas.toDataURL()), firstFrame, "thinking keeps moving");
  assert.equal(await stage.getAttribute("data-state"), "thinking");
  assert.equal(await stage.getAttribute("aria-hidden"), "true");

  // Frame rate with eight orbs on the page.
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    function count(now) {
      frames += 1;
      if (now - start < 1000) {
        requestAnimationFrame(count);
      } else {
        resolve(frames);
      }
    }
    requestAnimationFrame(count);
  }));
  assert.ok(fps >= 50, `frame rate ${fps}`);

  // An orb scrolled out of view stops drawing, and starts again when it comes back.
  const small = page.locator("figure", { hasText: "32 px" }).locator("canvas");
  const parked = await small.evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(400);
  assert.equal(await small.evaluate((canvas) => canvas.toDataURL()), parked, "off screen it pauses");
  await small.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const shown = await small.evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(300);
  assert.notEqual(await small.evaluate((canvas) => canvas.toDataURL()), shown, "on screen it moves");

  // Keyboard: the state buttons are reachable and report which one is on.
  await state.getByRole("button", { name: "Idle" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  assert.equal(await state.getByRole("button", { name: "Listening" }).getAttribute("aria-pressed"), "true");
  await page.screenshot({ path: `${screenshots}/orb-light.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await page.close();

  // Reduced motion: a still orb that still redraws for a new state.
  const still = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce", colorScheme: "dark" });
  await still.goto(baseURL + "/orb");
  await still.getByRole("heading", { name: "Agent orb" }).waitFor();
  await still.waitForTimeout(300);
  const stillOrb = still.locator(".orb-demo-stage canvas");
  const frozen = await stillOrb.evaluate((canvas) => canvas.toDataURL());
  await still.waitForTimeout(600);
  assert.equal(await stillOrb.evaluate((canvas) => canvas.toDataURL()), frozen, "reduced motion: nothing moves");
  await still.getByRole("group", { name: "State" }).getByRole("button", { name: "Listening" }).click();
  await still.waitForTimeout(100);
  assert.notEqual(await stillOrb.evaluate((canvas) => canvas.toDataURL()), frozen, "reduced motion: a new state is redrawn");
  await still.screenshot({ path: `${screenshots}/orb-dark-still.png` });
  await still.close();

  // Phone width: the 400 px orb shrinks to fit and nothing scrolls sideways.
  const phone = await browser.newPage({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  await phone.goto(baseURL + "/orb");
  await phone.getByRole("heading", { name: "Agent orb" }).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll");
  const big = await phone.locator("figure", { hasText: "400 px" }).locator("canvas").boundingBox();
  assert.ok(big.width <= 375 && Math.abs(big.width - big.height) < 1, `the big orb fits and stays round: ${big.width}x${big.height}`);
  await phone.screenshot({ path: `${screenshots}/orb-phone.png`, fullPage: true });
  console.log(`Orb browser check passed: idle breath, speaking grows and eases, fake wave without jitter, thinking holds its size, ${fps} fps with eight orbs, pauses off screen, keyboard, reduced motion, phone width.`);
} finally {
  await browser.close();
}
