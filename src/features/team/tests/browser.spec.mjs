// Run against an isolated test backend and a stand-in runtime: this creates an account, a saved map
// layout, saved forecasts and a short direct chat with Forecasting.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

async function centre(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function layoutSaved(page) {
  return page.waitForResponse((response) => response.url().endsWith("/api/team/layout") && response.request().method() === "PUT" && response.ok());
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await page.request.post(baseURL + "/api/auth/signup", { data: { username: `agentscheck_${Date.now()}`, password: "test-only-password-123" } });
  assert.equal(signup.status(), 201);

  // The old address still works.
  await page.goto(baseURL + "/team");
  await page.waitForURL(/\/agents$/);
  await page.getByRole("heading", { name: "My agents", exact: true }).waitFor();
  const operator = page.getByRole("button", { name: "Configure Operator", exact: true });
  const forecasting = page.getByRole("button", { name: "Configure Forecasting", exact: true });
  assert.equal(await page.locator(".map-card").count(), 2);
  assert.equal(await page.getByRole("button", { name: /Configure Inventory|Configure Procurement|Configure Store/ }).count(), 0);
  // One theme for every page: light by default, dark when the device asks for it.
  assert.equal(await page.locator(".team-shell").evaluate((node) => getComputedStyle(node).backgroundColor), "rgb(252, 251, 249)");
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await page.locator(".team-shell").evaluate((node) => getComputedStyle(node).backgroundColor), "rgb(15, 14, 13)");
  await page.emulateMedia({ colorScheme: "light" });
  // Every agent is a Mula agent with its own brain.
  await page.getByText("Ready · Qwen (local)").first().waitFor();
  assert.equal(await page.getByText("Ready · Qwen (local)").count(), 2);
  // The Operator asks Forecasting, after the owner's OK by default.
  await page.locator('.map-link[aria-label="Operator to Forecasting: Asks after your OK"]').waitFor();
  assert.equal(await page.locator(".map-link").count(), 1);
  await page.screenshot({ path: screenshots + "/mula-agents-map-desktop.png", fullPage: true });

  // Dragging moves a card and the new spot survives a reload; a drop does not open the panel.
  const before = await centre(operator);
  const dropped = layoutSaved(page);
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 60, { steps: 4 });
  await page.mouse.move(before.x + 240, before.y + 120, { steps: 4 });
  await page.mouse.up();
  await dropped;
  assert.equal(await page.getByRole("dialog").count(), 0);
  const moved = await centre(operator);
  assert.ok(Math.abs(moved.x - before.x - 240) < 3 && Math.abs(moved.y - before.y - 120) < 3, JSON.stringify({ before, moved }));
  await page.reload();
  await operator.waitFor();
  const reloaded = await centre(operator);
  assert.ok(Math.abs(reloaded.x - moved.x) < 3 && Math.abs(reloaded.y - moved.y) < 3, JSON.stringify({ moved, reloaded }));

  // Keyboard: arrow keys nudge the focused card and the change is saved.
  const forecastingBefore = await centre(forecasting);
  await forecasting.focus();
  const nudged = layoutSaved(page);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowUp");
  await nudged;
  const forecastingAfter = await centre(forecasting);
  assert.ok(forecastingAfter.x < forecastingBefore.x && forecastingAfter.y < forecastingBefore.y);
  await page.screenshot({ path: screenshots + "/mula-agents-map-arranged.png", fullPage: true });

  // Reset restores the default arrangement.
  await page.getByRole("button", { name: "Reset layout" }).click();
  await page.waitForFunction(() => document.querySelector(".map-reset")?.textContent === "Reset layout");
  const restored = await centre(operator);
  assert.ok(Math.abs(restored.x - before.x) < 3 && Math.abs(restored.y - before.y) < 3, JSON.stringify({ before, restored }));

  // A click opens the settings panel; settings persist.
  await operator.click();
  const panel = page.getByRole("dialog", { name: "Operator settings" });
  await panel.waitFor();
  await panel.getByLabel("Instructions", { exact: true }).fill("Reply briefly in English.");
  const delegation = panel.getByRole("radiogroup", { name: "When this agent needs another agent" });
  assert.equal(await delegation.getByLabel(/Ask me first/).isChecked(), true);
  await delegation.getByLabel(/Go ahead/).check();
  // Reference data lives in the Advanced layer; unsaved edits carry across layers.
  await panel.getByRole("tab", { name: "Advanced" }).click();
  await panel.getByLabel("Reference data", { exact: true }).fill("We operate a coffee shop. Sales values are in IDR.");
  await panel.getByRole("tab", { name: "Simple" }).click();
  await panel.getByRole("button", { name: "Save settings", exact: true }).click();
  await panel.getByText("Saved for your account. Applies to the next request.").waitFor();
  await panel.getByText("When Operator needs another agent").scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshots + "/mula-agents-panel-desktop.png" });
  // Esc with unsaved changes asks first; dismissing keeps the panel open.
  await panel.getByLabel("Instructions", { exact: true }).fill("Unsaved draft");
  page.once("dialog", (prompt) => { assert.match(prompt.message(), /Discard unsaved/); void prompt.dismiss(); });
  await page.keyboard.press("Escape");
  assert.equal(await panel.isVisible(), true);
  page.once("dialog", (prompt) => void prompt.accept());
  await panel.getByRole("button", { name: "Close settings" }).click();
  await panel.waitFor({ state: "detached" });
  await page.reload();
  await operator.click();
  const reopened = page.getByRole("dialog", { name: "Operator settings" });
  assert.equal(await reopened.getByLabel("Instructions", { exact: true }).inputValue(), "Reply briefly in English.");
  assert.equal(await reopened.getByLabel(/Go ahead/).isChecked(), true);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.locator('.map-link[aria-label="Operator to Forecasting: Asks directly, without waiting for your OK"]').waitFor();

  // Forecasting has its own brain and a direct chat, separate from the Operator's conversation.
  await forecasting.click();
  const forecastPanel = page.getByRole("dialog", { name: "Forecasting settings" });
  await forecastPanel.getByRole("tab", { name: "Advanced" }).click();
  assert.equal(await forecastPanel.getByLabel("Brain", { exact: true }).inputValue(), "qwen");
  await forecastPanel.getByRole("tab", { name: "Simple" }).click();
  assert.equal(await forecastPanel.getByRole("radiogroup", { name: "When this agent needs another agent" }).count(), 0);
  await forecastPanel.getByRole("tab", { name: "Chat", exact: true }).click();
  await forecastPanel.getByText("Ask Forecasting anything about your sales.").waitFor();
  await forecastPanel.getByLabel("Message Forecasting").fill("What will I sell next week?");
  await forecastPanel.getByRole("button", { name: "Send", exact: true }).click();
  await forecastPanel.getByRole("log", { name: "Chat with Forecasting" }).getByText(/about 410 per day/).waitFor();
  await page.screenshot({ path: screenshots + "/mula-agents-chat-desktop.png" });
  await forecastPanel.getByRole("tab", { name: "Simple", exact: true }).click();
  await forecastPanel.getByLabel("Instructions", { exact: true }).fill("Explain in three short sentences, in English.");
  await forecastPanel.getByRole("button", { name: "Save settings", exact: true }).click();
  await forecastPanel.getByText("Saved for your account. Applies to the next request.").waitFor();
  await forecastPanel.getByRole("tab", { name: "Run a forecast", exact: true }).click();
  const upload = forecastPanel.getByLabel("Upload historical data");
  await upload.waitFor();
  await page.waitForFunction(() => !document.querySelector('dialog input[type="file"]').disabled);
  const csv = "date,sales\n" + Array.from({ length: 30 }, (_, index) => `2026-01-${String(index + 1).padStart(2, "0")},${100 + index * 10}`).join("\n");
  await upload.setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await forecastPanel.getByText(/CSV: sales.csv/).waitFor();
  await forecastPanel.getByRole("button", { name: "Run forecast", exact: true }).click();
  await forecastPanel.getByRole("heading", { name: "sales · Trend (drift)" }).waitFor();
  assert.match(await forecastPanel.getByRole("table", { name: "Forecast values" }).innerText(), /2026-01-31\s+400/);
  const downloadPromise = page.waitForEvent("download");
  await forecastPanel.getByRole("button", { name: "Download forecast CSV ↓" }).click();
  assert.equal((await downloadPromise).suggestedFilename(), "mula-forecast.csv");
  if (process.env.MULA_TEST_EXPLANATION === "1") {
    await forecastPanel.getByRole("button", { name: "Ask Forecasting to explain" }).click();
    await forecastPanel.getByLabel("Forecasting explanation").waitFor({ timeout: 180000 });
    assert.ok((await forecastPanel.getByLabel("Forecasting explanation").innerText()).length > 20);
  }
  await page.screenshot({ path: screenshots + "/mula-forecast-desktop.png" });
  await page.reload();
  await forecasting.click();
  const reloadedPanel = page.getByRole("dialog", { name: "Forecasting settings" });
  await reloadedPanel.getByRole("tab", { name: "Chat", exact: true }).click();
  await reloadedPanel.getByText("What will I sell next week?").waitFor();
  await reloadedPanel.getByRole("tab", { name: "Run a forecast", exact: true }).click();
  await page.getByRole("heading", { name: "sales · Trend (drift)" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // Phones keep the pan-and-zoom map (map.browser.spec.mjs covers touch); Fit shows every card,
  // nothing scrolls sideways, and the panel fills the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Fit to screen" }).click();
  assert.equal(await page.locator(".map-link").count(), 1);
  // The map clips overflow, so check each card is fully on screen once the zoom glide settles.
  await page.waitForFunction(() => [...document.querySelectorAll(".map-card")].every((card) => { const box = card.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: screenshots + "/mula-agents-mobile.png", fullPage: true });
  await forecasting.click();
  const mobilePanel = page.getByRole("dialog", { name: "Forecasting settings" });
  assert.equal(Math.round((await mobilePanel.boundingBox()).width), 390);
  await mobilePanel.getByRole("button", { name: "Remove Last value tool" }).click();
  await mobilePanel.getByRole("tab", { name: "Run a forecast", exact: true }).click();
  await mobilePanel.getByText("Save your configuration changes before running a forecast.").waitFor();
  assert.equal(await mobilePanel.getByRole("button", { name: "Run forecast", exact: true }).isDisabled(), true);
  await page.screenshot({ path: screenshots + "/mula-agents-panel-mobile.png" });
  assert.deepEqual(errors, []);
  console.log("Agent map: redirect, links, drag and keyboard arrangement with persistence, reset, settings and delegation, Forecasting chat, forecasts, export and phone map passed.");
} finally { await browser.close(); }
