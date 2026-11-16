// My apps prototype check, together with the Catalogue it shares its store with.
// It fakes the signed-in account, so it needs only the frontend (no backend, no
// test account): MULA_TEST_URL, default http://localhost:3001.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

async function newPage(viewport) {
  // A fresh context per page: its own empty localStorage.
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "preview", username: "preview" } }));
  return { page, errors };
}

try {
  const { page, errors } = await newPage({ width: 1440, height: 1000 });

  // Empty state first, with a way to the Catalogue.
  await page.goto(baseURL + "/apps");
  await page.getByRole("heading", { name: "No apps yet" }).waitFor();
  assert.equal(await page.title(), "Mula · My apps");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const labels = (await nav.locator(".nav-item").allInnerTexts()).map((text) => text.replace("Soon", "").trim());
  assert.deepEqual(labels.slice(0, 3), ["Chat", "Catalogue", "My apps"]);
  assert.equal(await nav.getByRole("link", { name: "My apps" }).getAttribute("aria-current"), "page");
  await page.getByRole("link", { name: "Browse the Catalogue" }).click();

  // Add three apps in the Catalogue; agents are not offered to My apps.
  await page.getByRole("heading", { name: "Agents and apps for your business." }).waitFor();
  for (const name of ["Stock sheet", "Store app", "Invoice maker"]) {
    await page.getByRole("button", { name: `Add ${name}` }).click();
  }
  await page.getByRole("link", { name: "My apps" }).click();

  // Summary and order: the app that needs attention comes first.
  await page.getByRole("heading", { name: "Your apps and websites." }).waitFor();
  const summary = page.getByRole("list", { name: "Summary" });
  await summary.getByText("3 apps").waitFor();
  await summary.getByText("1 needs attention").waitFor();
  assert.deepEqual(await page.locator(".apps-card h2").allInnerTexts(), ["Store app", "Invoice maker", "Stock sheet"]);
  const sync = page.getByRole("article", { name: "Store app" });
  await sync.getByText("Needs attention").waitFor();
  await sync.getByText("The Tokopedia sign-in expired. Reconnect to resume syncing.").waitFor();
  await sync.getByText("Store", { exact: true }).waitFor();
  const invoice = page.getByRole("article", { name: "Invoice maker" });
  await invoice.getByText("Not connected").waitFor();
  await invoice.getByText("Never").waitFor();
  await invoice.getByText("No agents yet").waitFor();
  await page.getByRole("article", { name: "Stock sheet" }).getByText("12 minutes ago").waitFor();
  await page.screenshot({ path: `${screenshots}/apps-desktop.png`, fullPage: true });

  // Open and Settings explain that they are not built yet.
  await sync.getByRole("button", { name: "Open Store app" }).click();
  await page.getByText("Store app has no page yet in this prototype.").waitFor();
  await sync.getByRole("button", { name: "Settings for Store app" }).click();
  await page.getByText("Settings for Store app aren't built yet in this prototype.").waitFor();

  // Search by name and description.
  const search = page.getByLabel("Search my apps");
  await search.fill("invoices");
  await page.getByRole("status").filter({ hasText: "1 result" }).waitFor();
  await search.fill("zebra");
  await page.getByRole("heading", { name: "Nothing matches “zebra”" }).waitFor();
  await page.getByRole("button", { name: "Clear search" }).click();
  assert.equal(await page.locator(".apps-card").count(), 3);

  // Plugins nest inside their parent's card, and removing the parent says it takes them too.
  await page.goto(baseURL + "/catalogue/tokopedia-sync");
  for (const name of ["Store monitor", "Store admin"]) await page.getByRole("button", { name: `Add ${name}` }).click();
  await page.goto(baseURL + "/apps");
  await page.getByRole("heading", { name: "Your apps and websites." }).waitFor();
  assert.equal(await page.locator(".apps-card").count(), 3);
  assert.deepEqual(await sync.getByRole("list", { name: "Plugins" }).locator("li").allInnerTexts(), ["Store monitor", "Store admin"]);
  await sync.getByRole("button", { name: "Remove Store app" }).click();
  await sync.getByText("Remove Store app? It goes back to the Catalogue. This also removes 2 plugins.").waitFor();
  await sync.getByRole("button", { name: "Yes, remove" }).click();
  await page.getByText("Store app removed. It's back in the Catalogue as Available. Its 2 plugins were removed too.").waitFor();
  assert.equal(await page.locator(".apps-card").count(), 2);
  await page.goto(baseURL + "/catalogue/tokopedia-sync");
  await page.getByRole("button", { name: "Add Store app first to add Store monitor" }).waitFor();
  await page.goto(baseURL + "/apps");
  await page.getByRole("heading", { name: "Your apps and websites." }).waitFor();

  // Remove, by keyboard only: Escape cancels and returns focus, confirming removes.
  const remove = page.getByRole("button", { name: "Remove Invoice maker" });
  await remove.focus();
  await page.keyboard.press("Enter");
  await invoice.getByText("Remove Invoice maker? It goes back to the Catalogue.").waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Keep it");
  await page.keyboard.press("Escape");
  await remove.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Remove Invoice maker");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await page.getByText("Invoice maker removed. It's back in the Catalogue as Available.").waitFor();
  assert.equal(await page.locator(".apps-card").count(), 1);
  await summary.getByText("1 app").waitFor();

  // The added list survives a reload, and the Catalogue shows the removed app as Available again.
  await page.reload();
  await page.getByRole("heading", { name: "Your apps and websites." }).waitFor();
  assert.equal(await page.locator(".apps-card").count(), 1);
  await page.goto(baseURL + "/catalogue");
  await page.getByRole("article", { name: "Invoice maker" }).getByText("Available", { exact: true }).waitFor();
  await page.getByRole("article", { name: "Stock sheet" }).getByText("Added", { exact: true }).waitFor();
  assert.deepEqual(errors, []);

  // Phone width: one column, no sideways scroll.
  const phone = await newPage({ width: 390, height: 844 });
  await phone.page.goto(baseURL + "/catalogue");
  await phone.page.getByRole("button", { name: "Add Store app" }).click();
  await phone.page.goto(baseURL + "/apps");
  await phone.page.getByRole("heading", { name: "Your apps and websites." }).waitFor();
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  // Images load lazily; wait for the card's picture so the screenshot shows it.
  await phone.page.locator(".apps-card img").first().evaluate((image) => image.complete || new Promise((resolve) => { image.onload = resolve; }));
  await phone.page.screenshot({ path: `${screenshots}/apps-phone.png`, fullPage: true });
  assert.deepEqual(phone.errors, []);
  console.log("apps browser check passed");
} finally {
  await browser.close();
}
