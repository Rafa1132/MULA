// Agent settings panel check: Simple and Advanced layers, tools, connections and their map lines.
// It fakes the signed-in account and the team API, so it needs only the frontend:
// MULA_TEST_URL, default http://localhost:3001.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });
const ACCOUNT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

const BRAINS = {
  qwen: { name: "Qwen (local)", description: "Runs locally.", location: "local", status: "ready" },
  "claude-sonnet": { name: "Claude Sonnet 5.5", description: "Cloud.", location: "cloud", status: "ready" },
  "claude-opus": { name: "Claude Opus 5.5", description: "Cloud.", location: "cloud", status: "needs_setup" },
};

function agent(id, name, description, extra) {
  return { id, name, description, prompt: "", data: "", revision: 0, brain: "qwen", available_brains: BRAINS, delegates_to: [], delegation: null, ...extra };
}

async function openTeam(contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const operatorTools = { csv_read: "Read attached CSVs", memory_read: "Retrieve account memory", memory_write: "Save explicit /remember requests" };
  const agents = [
    agent("operator", "Operator", "Your everyday partner for questions and planning.", { tools: Object.keys(operatorTools), available_tools: operatorTools, delegates_to: ["forecasting"], delegation: "ask" }),
    agent("forecasting", "Forecasting", "Turns a sales history into a forecast.", { tools: ["naive", "drift"], available_tools: { naive: "Last value", drift: "Trend (drift)", explain: "Explain results in words" } }),
    agent("inventory", "Inventory", "Keeps an eye on stock levels.", { tools: [], available_tools: {} }),
  ];
  const puts = [];
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: ACCOUNT_ID, username: "panelcheck" } }));
  await page.route("**/api/team", (route) => route.fulfill({ json: { agents, layout: { operator: { x: 0.2, y: 0.3 }, forecasting: { x: 0.8, y: 0.3 }, inventory: { x: 0.5, y: 0.8 } } } }));
  await page.route("**/api/team/layout", (route) => route.fulfill({ json: { layout: route.request().postDataJSON().positions } }));
  await page.route(/\/api\/team\/(operator|forecasting|inventory)$/, (route) => {
    const id = route.request().url().split("/").pop();
    const body = route.request().postDataJSON();
    puts.push({ id, body });
    const target = agents.find((item) => item.id === id);
    Object.assign(target, { prompt: body.prompt, data: body.data, tools: body.tools, brain: body.brain, delegation: body.delegation, revision: target.revision + 1 });
    return route.fulfill({ json: target });
  });
  await page.goto(baseURL + "/agents");
  await page.locator('.map-world[data-ready="true"]').waitFor();
  return { context, page, errors, puts };
}

async function openPanel(page, name) {
  await page.getByRole("button", { name: `Configure ${name}`, exact: true }).click();
  const panel = page.getByRole("dialog", { name: `${name} settings` });
  await panel.waitFor();
  return panel;
}

async function closePanel(page, panel) {
  await panel.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
}

function contrast(foreground, background) {
  const luminance = (rgb) => {
    const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((value) => {
      const channel = value / 255;
      if (channel <= 0.03928) return channel / 12.92;
      return ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

try {
  const { context, page, errors, puts } = await openTeam({ viewport: { width: 1440, height: 1000 } });
  let panel = await openPanel(page, "Operator");

  // Tabs: Simple first and selected; arrows, Home and End move focus and selection.
  const tabs = panel.getByRole("tablist", { name: "Agent views" });
  assert.deepEqual(await tabs.getByRole("tab").allInnerTexts(), ["Simple", "Advanced"]);
  const simpleTab = tabs.getByRole("tab", { name: "Simple" });
  const advancedTab = tabs.getByRole("tab", { name: "Advanced" });
  assert.equal(await simpleTab.getAttribute("aria-selected"), "true");
  assert.equal(await panel.getByRole("tabpanel", { name: "Simple" }).count(), 1);
  // The old numbered step badges, including the "05", are gone.
  assert.equal(await panel.locator(".section-number").count(), 0);
  assert.equal(await panel.getByText(/^0\d$/).count(), 0);
  await simpleTab.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await advancedTab.getAttribute("aria-selected"), "true");
  assert.equal(await advancedTab.evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press("ArrowRight");
  assert.equal(await simpleTab.getAttribute("aria-selected"), "true");
  await page.keyboard.press("End");
  assert.equal(await advancedTab.getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home");
  assert.equal(await simpleTab.getAttribute("aria-selected"), "true");
  assert.equal(await simpleTab.getAttribute("tabindex"), "0");
  assert.equal(await advancedTab.getAttribute("tabindex"), "-1");

  // Instructions: count, unsaved indicator, Cancel reverts.
  const instructions = panel.getByLabel("Instructions", { exact: true });
  await instructions.fill("Reply briefly.");
  await panel.getByText("14 / 4,000 characters").waitFor();
  await panel.getByText("Unsaved changes").waitFor();
  await panel.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await instructions.inputValue(), "");
  await panel.getByText("Settings up to date").waitFor();

  // Tools: cards with remove buttons; removing moves focus to "Add tool".
  const toolCards = panel.locator(".tools-section > .panel-card-list > .panel-card");
  assert.equal(await toolCards.count(), 3);
  await panel.getByRole("button", { name: "Remove Retrieve account memory tool" }).click();
  assert.equal(await toolCards.count(), 2);
  const addTool = panel.getByRole("button", { name: "Add tool" });
  await page.waitForFunction(() => document.activeElement?.textContent === "Add tool");
  // The picker lists only missing tools; Escape closes it (not the panel) and returns focus.
  await addTool.click();
  assert.equal(await addTool.getAttribute("aria-expanded"), "true");
  const picker = panel.getByRole("group", { name: "Tools you can add" });
  assert.deepEqual(await picker.locator(".panel-card strong").allInnerTexts(), ["Retrieve account memory"]);
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Add Retrieve account memory tool");
  await page.keyboard.press("Escape");
  assert.equal(await picker.isVisible(), false);
  assert.equal(await panel.isVisible(), true);
  await page.waitForFunction(() => document.activeElement?.textContent === "Add tool");
  await addTool.click();
  await picker.getByRole("button", { name: "Add Retrieve account memory tool" }).click();
  assert.equal(await toolCards.count(), 3);
  await page.waitForFunction(() => document.activeElement?.id === "tool-card-memory_read");
  await panel.getByRole("button", { name: "Remove Save explicit /remember requests tool" }).click();
  await instructions.fill("Reply briefly in English.");
  await panel.getByRole("button", { name: "Save settings" }).click();
  await panel.getByText("Saved for your account.").waitFor();
  const saved = puts.at(-1);
  assert.equal(saved.id, "operator");
  assert.deepEqual(saved.body.tools, ["csv_read", "memory_read"]);
  assert.equal(saved.body.prompt, "Reply briefly in English.");
  assert.equal(saved.body.delegation, "ask");

  // Connections: add Inventory; the map draws a planned line for it.
  const connectionCards = panel.locator(".connections-section > .panel-card-list > .panel-card");
  assert.deepEqual(await connectionCards.locator("strong").allInnerTexts(), ["Forecasting"]);
  await panel.getByRole("button", { name: "Add connection" }).click();
  await panel.getByRole("button", { name: "Connect Inventory" }).click();
  assert.deepEqual(await connectionCards.locator("strong").allInnerTexts(), ["Forecasting", "Inventory"]);
  await page.waitForFunction(() => document.activeElement?.id === "connection-card-inventory");
  await panel.getByText(/Prototype: dashed “planned” connections/).waitFor();
  // Each connection card shows what the map line's tooltip says.
  assert.deepEqual(await connectionCards.locator(".connection-status").allInnerTexts(), ["Asks after your OK", "Planned: Mula doesn’t hand work along this yet"]);
  await page.screenshot({ path: screenshots + "/mula-panel-simple.png" });
  await closePanel(page, panel);
  assert.equal(await page.locator(".map-link").count(), 2);
  assert.equal(await page.locator('.map-link[data-planned="true"]').getAttribute("aria-label"), "Operator to Inventory: Planned: Mula doesn’t hand work along this yet");

  // Advanced: brain dropdown with the current brain selected; read-only "Set in config" values.
  panel = await openPanel(page, "Operator");
  await panel.getByRole("tab", { name: "Advanced" }).click();
  const brain = panel.getByLabel("Brain", { exact: true });
  assert.equal(await brain.evaluate((node) => node.tagName), "SELECT");
  assert.equal(await brain.inputValue(), "qwen");
  assert.deepEqual(await brain.locator("option").allInnerTexts(), ["Qwen (local) (on this computer)", "Claude Sonnet 5.5 (Anthropic cloud)", "Claude Opus 5.5 (Anthropic cloud) · needs setup"]);
  assert.equal(await brain.locator('option[value="claude-opus"]').isDisabled(), true);
  await brain.selectOption("claude-sonnet");
  await panel.getByText(/sends each message/).waitFor();
  await panel.getByText("Unsaved changes").waitFor();
  assert.ok(await panel.getByText("Set in config").count() >= 6);
  await panel.getByText("mula-0f8fad5bd9cb469fa16570867728950e").waitFor();
  await panel.getByText("csv_read, memory_read", { exact: true }).waitFor();
  await panel.getByLabel("Reference data", { exact: true }).fill("We sell coffee.");
  await panel.getByRole("button", { name: "Save settings" }).click();
  await panel.getByText("Saved for your account.").waitFor();
  assert.equal(puts.at(-1).body.brain, "claude-sonnet");
  assert.equal(puts.at(-1).body.data, "We sell coffee.");
  for (const selector of [".config-tag", ".config-row dt", ".field-caption", ".settings-help"]) {
    const colours = await panel.locator(selector).first().evaluate((node) => [getComputedStyle(node).color, getComputedStyle(document.querySelector(".agent-dialog")).backgroundColor]);
    assert.ok(contrast(...colours) >= 4.5, `${selector} contrast ${contrast(...colours).toFixed(2)}`);
  }
  await page.screenshot({ path: screenshots + "/mula-panel-advanced.png" });
  await closePanel(page, panel);

  // The last layer is remembered per user, across agents and reloads.
  panel = await openPanel(page, "Forecasting");
  assert.equal(await panel.getByRole("tab", { name: "Advanced" }).getAttribute("aria-selected"), "true");
  assert.deepEqual(await panel.getByRole("tablist").getByRole("tab").allInnerTexts(), ["Simple", "Advanced", "Chat", "Run a forecast"]);
  await closePanel(page, panel);
  await page.reload();
  await page.locator('.map-world[data-ready="true"]').waitFor();
  // Connections survive the reload too.
  assert.equal(await page.locator(".map-link").count(), 2);
  panel = await openPanel(page, "Operator");
  assert.equal(await panel.getByRole("tab", { name: "Advanced" }).getAttribute("aria-selected"), "true");
  assert.equal(await panel.getByLabel("Brain", { exact: true }).inputValue(), "claude-sonnet");

  // Removing a connection removes its line.
  await panel.getByRole("tab", { name: "Simple" }).click();
  await panel.getByRole("button", { name: "Remove connection to Forecasting" }).click();
  await page.waitForFunction(() => document.activeElement?.textContent === "Add connection");
  await closePanel(page, panel);
  assert.equal(await page.locator(".map-link").count(), 1);
  assert.equal(await page.locator(".map-link").getAttribute("aria-label"), "Operator to Inventory: Planned: Mula doesn’t hand work along this yet");
  // Forecasting can't ask on the runtime, so it has no approval choice, but can still get connections.
  panel = await openPanel(page, "Forecasting");
  assert.equal(await panel.getByRole("radiogroup", { name: "When this agent needs another agent" }).count(), 0);
  await closePanel(page, panel);
  assert.deepEqual(errors, []);
  await context.close();

  // Phones: the panel is a full-screen sheet with nothing scrolling sideways.
  const phone = await openTeam({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.page.getByRole("button", { name: "Fit to screen" }).click();
  await phone.page.waitForTimeout(300);
  const phonePanel = await openPanel(phone.page, "Operator");
  assert.equal(Math.round((await phonePanel.boundingBox()).width), 390);
  await phonePanel.getByRole("button", { name: "Add tool" }).waitFor();
  assert.ok(await phonePanel.evaluate((node) => node.scrollWidth <= node.clientWidth));
  await phonePanel.getByRole("button", { name: "Add connection" }).click();
  await phone.page.screenshot({ path: screenshots + "/mula-panel-phone.png" });
  await phonePanel.getByRole("tab", { name: "Advanced" }).click();
  assert.ok(await phonePanel.evaluate((node) => node.scrollWidth <= node.clientWidth));
  assert.deepEqual(phone.errors, []);
  await phone.context.close();

  console.log("Agent panel browser check passed: tabs and keys, remembered layer, instructions, tools and picker, connections and map lines, advanced settings, contrast and phone sheet.");
} finally {
  await browser.close();
}
