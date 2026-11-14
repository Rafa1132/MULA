// Run against an isolated test backend: this creates an account and saves, corrects and retires memories.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await page.request.post(baseURL + "/api/auth/signup", { data: { username: `memorycheck_${Date.now()}`, password: "test-only-password-123" } });
  assert.equal(signup.status(), 201);

  await page.goto(baseURL + "/memory");
  await page.getByRole("heading", { name: "Your memory, one fact at a time." }).waitFor();
  const business = page.getByRole("region", { name: "About the business" });
  const owner = page.getByRole("region", { name: "About the owner" });
  await business.getByText("Nothing saved yet").waitFor();

  // Add a business fact and an owner fact.
  await page.getByLabel("New memory").fill("Our coffee supplier is Aroma.");
  await page.getByRole("button", { name: "Add memory" }).click();
  await page.getByRole("status").filter({ hasText: /Saved as \[\d+\]/ }).waitFor();
  await business.getByText("Our coffee supplier is Aroma.").waitFor();
  await page.getByLabel("About", { exact: true }).selectOption("owner");
  await page.getByLabel("New memory").fill("Keep answers short.");
  await page.getByRole("button", { name: "Add memory" }).click();
  await owner.getByText("Keep answers short.").waitFor();

  // A near-duplicate is reported, not saved twice.
  await page.getByLabel("About", { exact: true }).selectOption("business");
  await page.getByLabel("New memory").fill("our coffee supplier is aroma!");
  await page.getByRole("button", { name: "Add memory" }).click();
  await page.getByRole("status").filter({ hasText: /Already in memory/ }).waitFor();
  assert.equal(await business.getByText(/coffee supplier is Aroma/i).count(), 1);

  // A secret is refused with a reason, and never appears on the page.
  await page.getByLabel("New memory").fill("API key: sk-live-abcdefghijklmnopqrstuvwxyz");
  await page.getByRole("button", { name: "Add memory" }).click();
  await page.getByRole("alert").filter({ hasText: /never saved/ }).waitFor();
  assert.equal(await page.getByText("abcdefghijklmnopqrstuvwxyz").count(), 0);

  // Correct: the new version is current, the old one is in the history.
  await business.getByRole("button", { name: "Correct" }).click();
  await business.getByLabel(/New version of memory/).fill("Our coffee supplier is Kopi Baru.");
  await business.getByRole("button", { name: "Save correction" }).click();
  await business.getByText("Our coffee supplier is Kopi Baru.").waitFor();
  await business.getByText(/History · 1 earlier version/).click();
  await business.getByText("Our coffee supplier is Aroma.").waitFor();
  await business.getByText(/Replaced by \[\d+\]/).waitFor();
  const summary = await page.locator(".memory-summary pre").textContent();
  assert.ok(summary.includes("Kopi Baru") && !summary.includes("Aroma"), "summary lists only current facts");

  // Retire: the fact leaves the summary and search.
  page.once("dialog", (dialog) => dialog.accept());
  await owner.getByRole("button", { name: "Retire" }).click();
  await page.getByRole("status").filter({ hasText: /Retired \[\d+\]/ }).waitFor();
  await owner.getByText("Nothing saved yet").waitFor();
  await page.getByLabel("Search memory").fill("short answers");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("No matching facts").waitFor();
  await page.screenshot({ path: `${screenshots}/memory-desktop.png`, fullPage: true });

  // The audit log names actions and ids only.
  const changes = await page.locator(".memory-changes").textContent();
  assert.ok(changes.includes("refused") && changes.includes("retired") && !changes.includes("Kopi Baru"));

  // Phone layout.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("heading", { name: "Your memory, one fact at a time." }).waitFor();
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, "no horizontal overflow");
  await page.screenshot({ path: `${screenshots}/memory-phone.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Memory page browser check passed.");
} finally {
  await browser.close();
}
