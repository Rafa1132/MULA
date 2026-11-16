// Catalogue prototype check. It fakes the signed-in account, so it needs only the
// frontend (no backend, no test account): MULA_TEST_URL, default http://localhost:3001.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

async function openCatalogue(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "preview", username: "preview" } }));
  // One missing picture, to prove a card falls back to its initial instead of looking broken.
  await page.route("**/catalogue/invoice-maker.png", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(baseURL + "/catalogue");
  await page.getByRole("heading", { name: "Agents and apps for your business." }).waitFor();
  return { page, errors };
}

try {
  const { page, errors } = await openCatalogue({ width: 1440, height: 1000 });
  assert.equal(await page.title(), "Mula · Catalogue");

  // Nav: Catalogue sits right after Chat and is the current page.
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const labels = (await nav.locator(".nav-item").allInnerTexts()).map((text) => text.replace("Soon", "").trim());
  assert.deepEqual(labels.slice(0, 2), ["Chat", "Catalogue"]);
  assert.equal(await nav.getByRole("link", { name: "Catalogue" }).getAttribute("aria-current"), "page");

  // Cards: nine entries (the two plugins never get cards), each with a type badge and a status.
  const cards = page.locator(".catalogue-card");
  assert.equal(await cards.count(), 9);
  assert.equal(await page.getByRole("article", { name: "Store monitor" }).count(), 0);
  const operator = page.getByRole("article", { name: "Operator" });
  await operator.getByText("Agent", { exact: true }).waitFor();
  await operator.getByText("Added", { exact: true }).waitFor();
  // Publisher line: plain text "by Mula" with a 16 px avatar, on every card.
  assert.equal(await page.locator(".catalogue-publisher", { hasText: "by Mula" }).count(), 9);
  assert.equal(await operator.locator(".catalogue-publisher a").count(), 0);
  const avatar = await operator.locator(".catalogue-publisher img").boundingBox();
  assert.equal(Math.round(avatar.width), 16);
  assert.equal(Math.round(avatar.height), 16);
  assert.equal(await operator.getByRole("link", { name: "Open Operator" }).getAttribute("href"), "/");
  assert.equal(await page.getByRole("img", { name: "Portrait of the Operator agent" }).count(), 1);
  assert.ok(await page.getByRole("button", { name: "Add Store (coming soon)" }).isDisabled());

  // Agents and apps use different frame shapes, measured rather than assumed.
  const agentFrame = await page.locator(".catalogue-frame-agent").first().boundingBox();
  const appFrame = await page.locator(".catalogue-frame-app").first().boundingBox();
  assert.ok(agentFrame.height > agentFrame.width * 1.2, "agent frame is a portrait");
  assert.ok(Math.abs(appFrame.height - appFrame.width * 0.75) < 2, "app frame is a 4:3 landscape tile");
  // The picture dominates the card: most of each card's height is the frame.
  const operatorCard = await page.locator(".catalogue-card-agent").first().boundingBox();
  assert.ok(agentFrame.height > operatorCard.height * 0.7, "the picture takes most of the card");
  // Each type has its own labelled section.
  assert.equal(await page.getByRole("region", { name: "Agents" }).locator(".catalogue-card").count(), 3);
  assert.equal(await page.getByRole("region", { name: "Apps" }).locator(".catalogue-card").count(), 6);

  // The failed image shows the initial tile.
  const invoice = page.getByRole("article", { name: "Invoice maker" });
  await invoice.locator(".catalogue-fallback", { hasText: "I" }).waitFor();
  assert.equal(await invoice.locator(".catalogue-frame img").count(), 0);
  await page.screenshot({ path: `${screenshots}/catalogue-desktop.png`, fullPage: true });

  // Search with the keyboard: name, description and tag matches, live count.
  await page.keyboard.press("Tab");
  const search = page.getByLabel("Search the catalogue");
  await search.focus();
  await page.keyboard.type("STOCK");
  await page.getByRole("status").filter({ hasText: "3 results" }).waitFor();
  assert.deepEqual(await page.locator(".catalogue-card h3").allInnerTexts(), ["Store", "Store app", "Stock sheet"]);
  // A section with no matches disappears.
  await search.fill("invoice");
  await page.getByRole("status").filter({ hasText: "1 result" }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Agents" }).count(), 0);
  await page.keyboard.press("Escape");
  await page.getByRole("status").filter({ hasText: "9 results" }).waitFor();

  // The publisher name is searchable.
  await search.fill("mula");
  await page.getByRole("status").filter({ hasText: "9 results" }).waitFor();

  // A plugin match shows its parent card with a hint, never the plugin itself.
  await search.fill("alerts");
  await page.getByRole("status").filter({ hasText: "1 result" }).waitFor();
  assert.deepEqual(await page.locator(".catalogue-card h3").allInnerTexts(), ["Store app"]);
  await page.getByRole("article", { name: "Store app" }).getByText("Includes Store monitor").waitFor();
  await search.fill("orders");
  await page.getByRole("status").filter({ hasText: "2 results" }).waitFor();
  assert.equal(await page.locator(".catalogue-hint").innerText(), "Includes Store monitor");

  // Empty state, then Clear search puts everything back and returns focus to the field.
  await search.fill("submarine");
  await page.getByRole("heading", { name: "Nothing matches “submarine”" }).waitFor();
  await page.getByRole("button", { name: "Clear search" }).click();
  assert.equal(await cards.count(), 9);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "catalogue-search");

  // Adding an app puts it in My apps, and its Open button then goes there.
  await page.getByRole("button", { name: "Add Store app" }).click();
  const sync = page.getByRole("article", { name: "Store app" });
  await sync.getByText("Added", { exact: true }).waitFor();
  await page.getByText("Store app added. Find it in My apps.").waitFor();
  assert.equal(await sync.getByRole("link", { name: "Open Store app" }).getAttribute("href"), "/apps");
  assert.deepEqual(errors, []);

  // Phone width: no sideways scroll, the top bar replaces the sidebar.
  const phone = await openCatalogue({ width: 390, height: 844 });
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.ok(await phone.page.locator(".topbar").isVisible());
  assert.ok(!(await phone.page.locator(".sidebar").isVisible()));
  await phone.page.screenshot({ path: `${screenshots}/catalogue-phone.png`, fullPage: true });
  assert.deepEqual(phone.errors, []);
  console.log("catalogue browser check passed");
} finally {
  await browser.close();
}
