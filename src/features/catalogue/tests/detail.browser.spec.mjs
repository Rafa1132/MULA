// Catalogue detail page check. It fakes the signed-in account, so it needs only the
// frontend (no backend, no test account): MULA_TEST_URL, default http://localhost:3001.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "preview", username: "preview" } }));
  // One missing preview, to prove the carousel falls back to the neutral tile.
  await context.route("**/catalogue/tokopedia-sync/2.png", (route) => route.fulfill({ status: 404, body: "" }));
  return { page, errors };
}

const counter = (page) => page.locator(".carousel-counter");

try {
  const { page, errors } = await newPage({ width: 1440, height: 1000 });

  // Card click opens the detail page; the card's button does not.
  await page.goto(baseURL + "/catalogue");
  await page.getByRole("heading", { name: "Agents and apps for your business." }).waitFor();
  await page.getByRole("button", { name: "Add Stock sheet" }).click();
  await page.getByRole("article", { name: "Stock sheet" }).getByText("Added", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/catalogue");
  // Click the middle of the card's picture, as a person would; the stretched link covers it.
  const picture = await page.getByRole("article", { name: "Store app" }).locator(".catalogue-media").boundingBox();
  await page.mouse.click(picture.x + picture.width / 2, picture.y + picture.height / 2);
  await page.waitForURL("**/catalogue/tokopedia-sync");
  await page.getByRole("link", { name: "Back to Catalogue" }).click();
  await page.waitForURL(/\/catalogue$/);
  // Keyboard: Enter on the card's name link.
  await page.getByRole("link", { name: "Store app", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/catalogue/tokopedia-sync");

  // Details.
  await page.getByRole("heading", { level: 1, name: "Store app" }).waitFor();
  assert.equal(await page.title(), "Mula · Store app");
  await page.locator(".detail-info").getByText("App", { exact: true }).waitFor();
  assert.equal(await page.locator(".detail-price").innerText(), "Free");
  // Publisher row: 32 px avatar, plain-text name, and the Official badge for a verified publisher.
  const publisherRow = page.locator(".detail-publisher");
  await publisherRow.getByText("Mula", { exact: true }).waitFor();
  assert.equal(await publisherRow.locator("a").count(), 0);
  const avatar = await publisherRow.locator("img").boundingBox();
  assert.equal(Math.round(avatar.width), 32);
  const badge = publisherRow.getByRole("img", { name: "Verified publisher" });
  assert.equal(await badge.innerText(), "Official");
  assert.equal(await badge.locator("svg").count(), 1);
  await page.getByText("Connect your Tokopedia shop", { exact: false }).waitFor();

  // Carousel: buttons, dots, wrap-around, arrow keys, alt text and the missing-image tile.
  const carousel = page.getByRole("region", { name: "Store app previews" });
  assert.equal(await counter(page).innerText(), "1 / 4");
  await carousel.getByRole("img", { name: "Store app: connecting a Tokopedia shop" }).waitFor();
  await carousel.getByRole("button", { name: "Next image" }).click();
  assert.equal(await counter(page).innerText(), "2 / 4");
  await carousel.locator(".catalogue-fallback", { hasText: "S" }).waitFor();
  assert.equal(await carousel.getByRole("button", { name: "Show image 2 of 4" }).getAttribute("aria-current"), "true");
  await carousel.getByRole("button", { name: "Show image 4 of 4" }).click();
  assert.equal(await counter(page).innerText(), "4 / 4");
  await carousel.getByRole("img", { name: "Store app: sync history" }).waitFor();
  await carousel.getByRole("button", { name: "Next image" }).click();
  assert.equal(await counter(page).innerText(), "1 / 4");
  await carousel.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await counter(page).innerText(), "4 / 4");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert.equal(await counter(page).innerText(), "2 / 4");
  await page.keyboard.press("ArrowRight");
  await carousel.getByRole("img", { name: "Store app: stock levels by product" }).waitFor();
  await page.waitForTimeout(1500);
  assert.equal(await counter(page).innerText(), "3 / 4", "the carousel never moves on its own");

  // Plugins: locked until the parent is added; adding the parent adds none of them.
  const plugins = page.getByRole("region", { name: "Plugins for Store app" });
  assert.deepEqual(await plugins.locator("h3").allInnerTexts(), ["Store monitor", "Store admin"]);
  const locked = plugins.getByRole("button", { name: "Add Store app first to add Store admin" });
  assert.ok(await locked.isDisabled());
  assert.equal(await locked.innerText(), "Add Store app first");
  await page.locator(".detail-info").getByRole("button", { name: "Add" }).click();
  await page.locator(".detail-info").getByRole("link", { name: "Open in My apps" }).waitFor();
  await plugins.getByRole("button", { name: "Add Store monitor" }).waitFor();
  await plugins.getByRole("button", { name: "Add Store admin" }).click();
  assert.ok(await plugins.getByRole("button", { name: "Store admin added" }).isDisabled());
  await page.screenshot({ path: `${screenshots}/detail-desktop.png`, fullPage: true });

  // The adds reached the shared store: they survive a reload, and the plugin sits inside its parent in My apps.
  await page.reload();
  await page.getByRole("region", { name: "Plugins for Store app" }).getByRole("button", { name: "Store admin added" }).waitFor();
  await page.goto(baseURL + "/apps");
  await page.getByRole("heading", { name: "Your apps and websites." }).waitFor();
  assert.deepEqual(await page.locator(".apps-card h2").allInnerTexts(), ["Store app", "Stock sheet"]);
  assert.deepEqual(await page.getByRole("article", { name: "Store app" }).getByRole("list", { name: "Plugins" }).locator("li").allInnerTexts(), ["Store admin"]);

  // A plugin's own address redirects to its parent's plugins section, which gets focus.
  await page.goto(baseURL + "/catalogue/store-monitor");
  await page.waitForURL("**/catalogue/tokopedia-sync#plugins");
  await page.getByRole("heading", { level: 1, name: "Store app" }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "detail-plugins-heading");
  // At this size the whole page fits, so the section only needs to be on screen; the phone check below needs a real scroll.
  const sectionTop = await page.locator("#plugins").evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(sectionTop >= -1 && sectionTop < 1000, `plugins section is on screen (top ${sectionTop})`);

  // To-do: no plugins.
  await page.goto(baseURL + "/catalogue/todo");
  await page.getByRole("heading", { level: 1, name: "To-do" }).waitFor();
  assert.equal(await page.title(), "Mula · To-do");
  await page.getByRole("region", { name: "Plugins for To-do" }).getByText("No plugins yet.").waitFor();
  assert.equal(await counter(page).innerText(), "1 / 4");

  // An unknown id is a 404.
  const missing = await page.goto(baseURL + "/catalogue/not-a-real-app");
  assert.equal(missing.status(), 404);
  assert.deepEqual(errors, []);

  // Phone width: the carousel is full width and nothing scrolls sideways.
  const phone = await newPage({ width: 390, height: 844 });
  await phone.page.goto(baseURL + "/catalogue/tokopedia-sync");
  await phone.page.getByRole("heading", { level: 1, name: "Store app" }).waitFor();
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const box = await phone.page.locator(".carousel").boundingBox();
  assert.ok(box.width >= 390 - 32 - 1, `carousel is ${box.width}px wide`);
  await phone.page.locator(".carousel img").first().evaluate((image) => image.complete || new Promise((resolve) => { image.onload = resolve; }));
  await phone.page.screenshot({ path: `${screenshots}/detail-phone.png`, fullPage: true });
  // On a phone the plugins section is far down, so the redirect has to scroll to it.
  await phone.page.goto(baseURL + "/catalogue/store-admin");
  await phone.page.waitForURL("**/catalogue/tokopedia-sync#plugins");
  await phone.page.waitForFunction(() => document.activeElement?.id === "detail-plugins-heading");
  const phoneTop = await phone.page.locator("#plugins").evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(await phone.page.evaluate(() => window.scrollY > 0), "the page scrolled");
  assert.ok(phoneTop >= -1 && phoneTop < 120, `plugins section is at the top (top ${phoneTop})`);
  assert.deepEqual(phone.errors, []);
  console.log("catalogue detail browser check passed");
} finally {
  await browser.close();
}
