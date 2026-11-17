// My agents map check: connectors, stamina bars, pan and zoom. It fakes the signed-in account and the
// team API (three agents, with a third card standing between Operator and Forecasting), so it needs only
// the frontend: MULA_TEST_URL, default http://localhost:3001.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

function agent(id, name, extra = {}) {
  return {
    id, name, description: `${name} test agent.`, prompt: "", data: "", tools: [], available_tools: {}, revision: 1, brain: "qwen",
    available_brains: { qwen: { name: "Qwen (local)", description: "Runs locally.", location: "local", host: "this computer", status: "ready" } },
    delegates_to: [], delegation: null, ...extra,
  };
}

async function openMap(contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const agents = [
    agent("operator", "Operator", { delegates_to: ["forecasting"], delegation: "ask" }),
    agent("forecasting", "Forecasting", { stamina: { used: 45_000, limit: 50_000 } }),
    agent("inventory", "Inventory"),
  ];
  const layout = { operator: { x: 0.2, y: 0.5 }, inventory: { x: 0.5, y: 0.5 }, forecasting: { x: 0.8, y: 0.5 } };
  const saves = [];
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "preview", username: "mapcheck" } }));
  await page.route("**/api/team", (route) => route.fulfill({ json: { agents, layout } }));
  await page.route("**/api/team/layout", (route) => {
    const body = route.request().postDataJSON();
    saves.push(body.positions);
    return route.fulfill({ json: { layout: body.positions } });
  });
  await page.route("**/api/team/operator", (route) => {
    const body = route.request().postDataJSON();
    Object.assign(agents[0], { delegation: body.delegation, revision: agents[0].revision + 1 });
    return route.fulfill({ json: agents[0] });
  });
  await page.goto(baseURL + "/agents");
  await page.getByRole("heading", { name: "My agents", exact: true }).waitFor();
  await page.locator('.map-world[data-ready="true"]').waitFor();
  return { context, page, errors, saves };
}

/** The current view from the world's transform: translate(x, y) scale(zoom). */
async function view(page) {
  const transform = await page.locator(".map-world").evaluate((node) => node.style.transform);
  const match = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(transform);
  assert.ok(match, transform);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

async function zoomLabel(page) {
  return page.locator(".map-zoom-value").innerText();
}

/** Points along the connector line in screen pixels. */
function samples(page) {
  return page.locator(".map-link-line").evaluate((path) => {
    const matrix = path.getScreenCTM();
    const length = path.getTotalLength();
    return Array.from({ length: 81 }, (_, index) => {
      const point = path.getPointAtLength((length * index) / 80);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    });
  });
}

async function box(page, id) {
  return page.locator(`.map-card[data-agent="${id}"]`).boundingBox();
}

/** Lines start and end beside the middle of the facing card edges, and never cross the card between. */
async function assertConnectorAligned(page) {
  // Let any zoom glide finish, and keep the pointer off the cards so none is lifted by hover.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(350);
  const { zoom } = await view(page);
  const points = await samples(page);
  const operator = await box(page, "operator");
  const forecasting = await box(page, "forecasting");
  const inventory = await box(page, "inventory");
  const start = points[0];
  const end = points[points.length - 1];
  const gap = 12 * zoom;
  assert.ok(Math.abs(start.x - (operator.x + operator.width + gap)) < 2, JSON.stringify({ start, operator, zoom }));
  assert.ok(Math.abs(start.y - (operator.y + operator.height / 2)) < 4 * zoom + 1, JSON.stringify({ start, operator }));
  assert.ok(Math.abs(end.x - (forecasting.x - gap)) < 2, JSON.stringify({ end, forecasting }));
  for (const point of points) {
    const inside = point.x > inventory.x && point.x < inventory.x + inventory.width && point.y > inventory.y && point.y < inventory.y + inventory.height;
    assert.equal(inside, false, `line passes through Inventory at ${JSON.stringify(point)}`);
  }
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
  const { context, page, errors, saves } = await openMap({ viewport: { width: 1440, height: 1000 } });
  const viewport = page.locator(".map-viewport");

  // First visit fits every agent on screen.
  const area = await viewport.boundingBox();
  for (const id of ["operator", "inventory", "forecasting"]) {
    const card = await box(page, id);
    assert.ok(card.x >= area.x && card.y >= area.y && card.x + card.width <= area.x + area.width && card.y + card.height <= area.y + area.height, id);
  }
  const fitted = await zoomLabel(page);

  // Connectors: one active link, solid with round caps, routed around Inventory.
  const link = page.locator(".map-link");
  assert.equal(await link.count(), 1);
  assert.equal(await link.getAttribute("data-planned"), "false");
  const line = page.locator(".map-link-line");
  // Every line is one smooth curve: only cubic segments, no straight runs or corners.
  assert.match(await line.getAttribute("d"), /^M[\d. -]+( C[\d. -]+)+$/);
  assert.equal(await line.evaluate((node) => getComputedStyle(node).strokeDasharray), "none");
  assert.equal(await line.evaluate((node) => getComputedStyle(node).strokeLinecap), "round");
  assert.equal(await line.evaluate((node) => getComputedStyle(node).strokeWidth), "2px");
  await assertConnectorAligned(page);
  await page.screenshot({ path: screenshots + "/mula-map-connectors.png" });

  // Lines carry no text. Their meaning is the line's accessible name and a tooltip on hover or focus.
  assert.equal(await page.locator(".map-links text").count(), 0);
  const meaning = "Operator to Forecasting: Asks after your OK";
  assert.equal(await link.getAttribute("aria-label"), meaning);
  const tip = page.locator(".map-link-tip");
  const middle = (await samples(page))[40];
  await page.mouse.move(middle.x, middle.y);
  await tip.waitFor();
  assert.equal(await tip.innerText(), meaning);
  await page.screenshot({ path: screenshots + "/mula-map-tooltip.png" });
  // The pointer can move onto the tooltip without it disappearing (WCAG 1.4.13).
  const tipBox = await tip.boundingBox();
  await page.mouse.move(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2, { steps: 3 });
  await page.waitForTimeout(250);
  assert.equal(await tip.isVisible(), true);
  await page.mouse.move(2, 2);
  await tip.waitFor({ state: "detached" });
  // Keyboard: focusing a line shows it; Escape dismisses it.
  await link.focus();
  await tip.waitFor();
  const tipHeight = (await tip.boundingBox()).height;
  await page.keyboard.press("Escape");
  await tip.waitFor({ state: "detached" });
  // Lines don't animate.
  assert.equal(await line.evaluate((node) => getComputedStyle(node).animationName), "none");

  // Stamina: unlimited is a full, label-free purple bar with energy flowing through it, centred on
  // its card; a low limit says "Low" in words.
  const operatorCard = page.getByRole("button", { name: "Configure Operator", exact: true });
  const forecastingCard = page.getByRole("button", { name: "Configure Forecasting", exact: true });
  const energy = operatorCard.locator('.stamina[data-unlimited="true"]');
  await energy.waitFor();
  assert.equal(await operatorCard.locator(".stamina-label").count(), 0);
  assert.equal(await operatorCard.locator('.stamina-cell[data-filled="true"]').count(), 10);
  const cells = operatorCard.locator(".stamina-cell");
  assert.equal(await cells.first().evaluate((node) => getComputedStyle(node).animationName), "stamina-energy");
  // The wave travels: each segment starts a little later than the one before it.
  assert.deepEqual(await cells.evaluateAll((nodes) => nodes.slice(0, 3).map((node) => getComputedStyle(node).animationDelay)), ["0s", "0.1s", "0.2s"]);
  const [red, green, blue] = (await cells.first().evaluate((node) => getComputedStyle(node).backgroundColor)).match(/\d+/g).map(Number);
  assert.ok(blue > red && red > green, `unlimited segments are purple, got rgb(${red}, ${green}, ${blue})`);
  const [barCentre, cardCentre] = await operatorCard.evaluate((card) => [card.querySelector(".stamina-track"), card].map((node) => {
    const box = node.getBoundingClientRect();
    return box.left + box.width / 2;
  }));
  assert.ok(Math.abs(barCentre - cardCentre) < 1, `bar is ${barCentre - cardCentre}px off the card's centre`);
  assert.equal(await energy.getAttribute("title"), "Unlimited stamina. Stamina is how many tokens this agent can still use this period.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await cells.first().evaluate((node) => getComputedStyle(node).animationName), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await forecastingCard.locator(".stamina-label", { hasText: "5k / 50k left" }).waitFor();
  await forecastingCard.locator(".stamina-low", { hasText: "Low" }).waitFor();
  assert.equal(await forecastingCard.locator('.stamina-cell[data-filled="true"]').count(), 1);
  assert.equal(await forecastingCard.locator(".stamina").getAttribute("title"), "Stamina is how many tokens this agent can still use this period.");
  // Screen readers hear the stamina in each card's description.
  const description = (card) => card.evaluate((node) => node.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id).textContent).join(". "));
  assert.equal(await description(operatorCard), "Ready · Qwen (local). Stamina: unlimited");
  assert.equal(await description(forecastingCard), "Ready · Qwen (local). Stamina: 5k of 50k tokens left, low");
  for (const selector of [".stamina-label", ".stamina-low", ".map-card-status"]) {
    const ratio = await forecastingCard.locator(selector).first().evaluate((node) => [getComputedStyle(node).color, getComputedStyle(node.closest(".map-card")).backgroundColor]);
    assert.ok(contrast(...ratio) >= 4.5, `${selector} contrast ${contrast(...ratio).toFixed(2)}`);
  }

  // Controls: real buttons with names; the % resets to 100% and Fit goes back to the first view.
  for (const name of ["Zoom out", "Zoom in", "Fit to screen", "What is stamina?"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 1);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.ok(parseInt(await zoomLabel(page)) > parseInt(fitted));
  await page.getByRole("button", { name: /reset zoom to 100%/ }).click();
  assert.equal(await zoomLabel(page), "100%");
  await page.getByRole("button", { name: "Fit to screen" }).click();
  assert.equal(await zoomLabel(page), fitted);
  const info = page.getByRole("button", { name: "What is stamina?" });
  await info.click();
  assert.equal(await info.getAttribute("aria-expanded"), "true");
  await page.getByText("Stamina is how many tokens this agent can still use this period.", { exact: true }).waitFor();
  await info.press("Escape");
  assert.equal(await info.getAttribute("aria-expanded"), "false");

  // Keyboard, only while the map has focus: - and + zoom, 0 resets, arrows pan, F fits.
  await page.getByRole("button", { name: "Reset layout" }).focus();
  await page.keyboard.press("-");
  assert.equal(await zoomLabel(page), fitted);
  await viewport.focus();
  await page.keyboard.press("-");
  assert.ok(parseInt(await zoomLabel(page)) < parseInt(fitted));
  await page.keyboard.press("0");
  assert.equal(await zoomLabel(page), "100%");
  const beforePan = await view(page);
  await page.keyboard.press("ArrowRight");
  assert.equal(Math.round((await view(page)).x - beforePan.x), -60);
  await page.keyboard.press("f");
  assert.equal(await zoomLabel(page), fitted);
  // With a card focused, the arrow keys move the card, not the map.
  const viewBeforeNudge = await view(page);
  const cardBefore = await box(page, "inventory");
  const nudged = page.waitForRequest((request) => request.url().endsWith("/api/team/layout"));
  await page.locator('.map-card[data-agent="inventory"]').focus();
  await page.keyboard.press("ArrowDown");
  await nudged;
  assert.deepEqual(await view(page), viewBeforeNudge);
  assert.ok((await box(page, "inventory")).y > cardBefore.y);

  // Ctrl + wheel zooms around the cursor; a plain wheel pans.
  await page.keyboard.press("f");
  const cursor = { x: area.x + 120, y: area.y + 60 };
  const beforeWheel = await view(page);
  const worldUnderCursor = { x: (cursor.x - area.x - beforeWheel.x) / beforeWheel.zoom, y: (cursor.y - area.y - beforeWheel.y) / beforeWheel.zoom };
  await page.mouse.move(cursor.x, cursor.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await page.waitForTimeout(100);
  const afterWheel = await view(page);
  assert.ok(afterWheel.zoom > beforeWheel.zoom);
  assert.ok(Math.abs((cursor.x - area.x - afterWheel.x) / afterWheel.zoom - worldUnderCursor.x) < 0.5);
  assert.ok(Math.abs((cursor.y - area.y - afterWheel.y) / afterWheel.zoom - worldUnderCursor.y) < 0.5);
  await page.mouse.wheel(0, 80);
  await page.waitForTimeout(100);
  const afterScroll = await view(page);
  assert.equal(afterScroll.zoom, afterWheel.zoom);
  assert.equal(Math.round(afterScroll.y - afterWheel.y), -80);

  // Dragging empty space pans; dragging a card moves the card and leaves the map still.
  await page.keyboard.press("f");
  await viewport.focus();
  await page.keyboard.press("f");
  const beforeDrag = await view(page);
  await page.mouse.move(area.x + 20, area.y + 20);
  await page.mouse.down();
  await page.mouse.move(area.x + 80, area.y + 50, { steps: 4 });
  await page.mouse.up();
  const afterDrag = await view(page);
  assert.equal(Math.round(afterDrag.x - beforeDrag.x), 60);
  assert.equal(Math.round(afterDrag.y - beforeDrag.y), 30);
  await page.waitForTimeout(250);
  const savesBefore = saves.length;
  const dragged = page.waitForRequest((request) => request.url().endsWith("/api/team/layout"));
  const operatorBox = await box(page, "operator");
  await page.mouse.move(operatorBox.x + 40, operatorBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(operatorBox.x + 40, operatorBox.y + 140, { steps: 5 });
  await page.mouse.up();
  await dragged;
  assert.deepEqual(await view(page), afterDrag);
  assert.ok(saves.length > savesBefore);
  assert.equal(await page.getByRole("dialog").count(), 0);
  await assertConnectorAligned(page);

  // Far out, cards keep the mascot, name and bar; the status and stamina label are hidden.
  const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
  while (await zoomOut.isEnabled()) await zoomOut.click();
  assert.equal(await zoomLabel(page), "25%");
  assert.equal(await page.locator('.agent-map[data-detail="low"]').count(), 1);
  assert.equal(await operatorCard.locator(".map-card-status").isVisible(), false);
  assert.equal(await forecastingCard.locator(".stamina-label").isVisible(), false);
  assert.equal(await operatorCard.locator(".stamina-track").isVisible(), true);
  const nameOnScreen = await operatorCard.locator("strong").evaluate((node) => node.getBoundingClientRect().height);
  assert.ok(nameOnScreen >= 11, `name is ${nameOnScreen}px tall on screen`);
  // Tooltips read at the same size at any zoom (measured once the zoom glide has finished).
  await page.waitForTimeout(350);
  await link.focus();
  await tip.waitFor();
  assert.ok(Math.abs((await tip.boundingBox()).height - tipHeight) < 1.5);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.screenshot({ path: screenshots + "/mula-map-low-zoom.png" });

  // The view is remembered for this user after a reload.
  await page.waitForTimeout(400);
  await page.reload();
  await page.locator('.map-world[data-ready="true"]').waitFor();
  assert.equal(await zoomLabel(page), "25%");
  await page.getByRole("button", { name: "Fit to screen" }).click();

  // Resizing the window keeps connectors on their anchors.
  await page.setViewportSize({ width: 1000, height: 800 });
  await assertConnectorAligned(page);

  // The settings panel shows stamina as a named image (unlimited) or a meter (limited).
  await operatorCard.click();
  await page.getByRole("img", { name: "Stamina: unlimited" }).waitFor();
  // Switching delegation off in the panel turns the link into a dashed, "off" planned connection.
  await page.getByRole("radio", { name: /Don’t ask other agents/ }).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByText("Saved for your account.").waitFor();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await link.getAttribute("data-planned"), "true");
  assert.notEqual(await line.evaluate((node) => getComputedStyle(node).strokeDasharray), "none");
  assert.equal(await link.getAttribute("aria-label"), "Operator to Forecasting: Off: set to Don’t ask other agents");
  await assertConnectorAligned(page);
  await page.screenshot({ path: screenshots + "/mula-map-planned.png" });
  // A resize keeps the view, so the narrower window shows less; fit again to reach Forecasting.
  await page.getByRole("button", { name: "Fit to screen" }).click();
  await page.waitForTimeout(300);
  await forecastingCard.click();
  const meter = page.getByRole("meter", { name: "Stamina" });
  assert.equal(await meter.getAttribute("aria-valuenow"), "5000");
  assert.equal(await meter.getAttribute("aria-valuemax"), "50000");
  assert.equal(await meter.getAttribute("aria-valuetext"), "5k of 50k tokens left, low");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // Reduced motion: zoom buttons jump instead of gliding.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal(await page.locator(".map-world").evaluate((node) => getComputedStyle(node).transitionDuration), "0s");
  assert.deepEqual(errors, []);
  await context.close();

  // Phones keep the canvas: it fits every agent, pinch zooms and one finger pans.
  const phone = await openMap({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phoneArea = await phone.page.locator(".map-viewport").boundingBox();
  for (const id of ["operator", "inventory", "forecasting"]) {
    const card = await box(phone.page, id);
    assert.ok(card.x >= phoneArea.x && card.x + card.width <= phoneArea.x + phoneArea.width, id);
  }
  assert.ok(await phone.page.getByRole("button", { name: "Fit to screen" }).isVisible());
  assert.ok(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const cdp = await phone.context.newCDPSession(phone.page);
  const midY = phoneArea.y + 30;
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const beforePinch = await view(phone.page);
  await touch("touchStart", [{ x: 150, y: midY, id: 1 }, { x: 240, y: midY, id: 2 }]);
  for (let step = 1; step <= 6; step += 1) await touch("touchMove", [{ x: 150 - step * 10, y: midY, id: 1 }, { x: 240 + step * 10, y: midY, id: 2 }]);
  await touch("touchEnd", []);
  const afterPinch = await view(phone.page);
  assert.ok(afterPinch.zoom > beforePinch.zoom * 1.5, JSON.stringify({ beforePinch, afterPinch }));
  await touch("touchStart", [{ x: 200, y: midY, id: 3 }]);
  for (let step = 1; step <= 5; step += 1) await touch("touchMove", [{ x: 200 - step * 10, y: midY + step * 4, id: 3 }]);
  await touch("touchEnd", []);
  const afterSwipe = await view(phone.page);
  assert.equal(Math.round(afterSwipe.x - afterPinch.x), -50);
  assert.equal(Math.round(afterSwipe.y - afterPinch.y), 20);
  await phone.page.getByRole("button", { name: "Fit to screen" }).click();
  await phone.page.waitForTimeout(300);
  await phone.page.screenshot({ path: screenshots + "/mula-map-phone.png" });
  assert.deepEqual(phone.errors, []);
  await phone.context.close();

  console.log("Agent map browser check passed: curved connectors, tooltips, stamina, controls, keys, wheel, drag, low zoom, saved view, resize, planned links, reduced motion and touch.");
} finally {
  await browser.close();
}
