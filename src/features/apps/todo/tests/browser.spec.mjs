// To-do prototype check. It fakes the signed-in account, so it needs only the
// frontend (no backend, no test account): MULA_TEST_URL, default http://localhost:3001.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

/** A local calendar day `offset` days from today, as the date field expects it. */
function day(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function newPage(viewport) {
  const context = await browser.newContext({ viewport });
  await context.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "preview", username: "preview" } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { page, errors };
}

const focusedLabel = (page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.id);
const titles = (page) => page.locator(".todo-title").allInnerTexts();

try {
  const { page, errors } = await newPage({ width: 1440, height: 1000 });

  // Not added yet: a short message and Add To-do instead of the app.
  await page.goto(baseURL + "/apps/todo");
  await page.getByRole("heading", { name: "To-do isn't added yet" }).waitFor();
  assert.equal(await page.title(), "Mula · To-do");
  // A separate app: its own header with the name and a small Mula link, and no main nav.
  await page.locator(".todo-appbar").getByRole("heading", { level: 1, name: "To-do" }).waitFor();
  assert.equal(await page.locator(".todo-appbar").getByRole("link", { name: "Mula" }).getAttribute("href"), "/");
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 0);
  assert.equal(await page.locator(".sidebar").count(), 0);
  assert.equal(await page.getByLabel("Title").count(), 0);
  await page.getByRole("button", { name: "Add To-do" }).click();

  // Empty state, then add by keyboard: Enter submits, and the form clears and keeps focus.
  await page.getByText("No tasks yet. Add your first one above.").waitFor();
  const title = page.getByLabel("Title");
  await title.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("alert").filter({ hasText: "Enter a title for the task." }).waitFor();
  assert.equal(await title.getAttribute("aria-invalid"), "true");
  assert.equal(await focusedLabel(page), "todo-new-title");
  await title.fill("Buy packing tape");
  await page.getByLabel("Note (optional)").fill("Brown, two rolls");
  await page.getByLabel("Due date (optional)").fill(day(0));
  await title.press("Enter");
  await page.getByText("Buy packing tape").waitFor();
  assert.equal(await title.inputValue(), "");
  assert.equal(await focusedLabel(page), "todo-new-title");
  assert.equal(await page.locator(".todo-error").count(), 0);
  for (const [name, due] of [["Pay the supplier", day(-2)], ["Plan the weekend sale", day(3)], ["Sweep the storeroom", ""]]) {
    await title.fill(name);
    await page.getByLabel("Due date (optional)").fill(due);
    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByText(name, { exact: true }).waitFor();
  }

  // Sort and overdue: open tasks by due date, undated last; overdue has a word and an icon.
  assert.deepEqual(await titles(page), ["Pay the supplier", "Buy packing tape", "Plan the weekend sale", "Sweep the storeroom"]);
  const lateRow = page.locator(".todo-item", { hasText: "Pay the supplier" });
  await lateRow.getByText("Overdue").waitFor();
  assert.equal(await lateRow.locator(".todo-overdue svg").count(), 1);
  await page.locator(".todo-item", { hasText: "Buy packing tape" }).getByText("Due Today").waitFor();
  await page.getByText("4 open · 1 overdue", { exact: false }).waitFor();

  // Checkbox: a real checkbox named by the task; done moves to the bottom.
  const tape = page.getByRole("checkbox", { name: "Buy packing tape" });
  await tape.focus();
  await page.keyboard.press("Space");
  assert.equal(await tape.isChecked(), true);
  assert.deepEqual(await titles(page), ["Pay the supplier", "Plan the weekend sale", "Sweep the storeroom", "Buy packing tape"]);

  // Filters with counts, and their empty states.
  const filters = page.getByRole("group", { name: "Filter tasks" });
  assert.deepEqual((await filters.getByRole("button").allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim()), ["All 4", "Today 1", "Upcoming 1", "Done 1"]);
  assert.equal(await filters.getByRole("button", { name: "All 4" }).getAttribute("aria-pressed"), "true");
  await filters.getByRole("button", { name: "Today 1" }).click();
  assert.deepEqual(await titles(page), ["Pay the supplier"]);
  await filters.getByRole("button", { name: "Upcoming 1" }).click();
  assert.deepEqual(await titles(page), ["Plan the weekend sale"]);
  await filters.getByRole("button", { name: "Done 1" }).click();
  assert.deepEqual(await titles(page), ["Buy packing tape"]);
  // Clicks, not check()/uncheck(): the row correctly leaves the filtered list, so there is nothing to re-read.
  await page.getByRole("checkbox", { name: "Buy packing tape" }).click();
  await page.getByText("No finished tasks yet.").waitFor();
  await filters.getByRole("button", { name: "Today 2" }).click();
  await page.getByRole("checkbox", { name: "Pay the supplier" }).click();
  await page.getByRole("checkbox", { name: "Buy packing tape" }).click();
  await page.getByText("Nothing due today.").waitFor();
  await filters.getByRole("button", { name: "Upcoming 1" }).click();
  await page.getByRole("checkbox", { name: "Plan the weekend sale" }).click();
  await page.getByText("Nothing coming up.").waitFor();
  await filters.getByRole("button", { name: /^All/ }).click();
  for (const name of ["Pay the supplier", "Buy packing tape", "Plan the weekend sale"]) await page.getByRole("checkbox", { name }).uncheck();

  // Inline edit by keyboard: Escape cancels, Enter saves, focus returns to Edit.
  const edit = page.getByRole("button", { name: "Edit Sweep the storeroom" });
  await edit.focus();
  await page.keyboard.press("Enter");
  const editTitle = page.locator(".todo-item-editing").getByLabel("Title");
  assert.equal(await editTitle.inputValue(), "Sweep the storeroom");
  await editTitle.fill("Changed my mind");
  await page.keyboard.press("Escape");
  assert.equal(await focusedLabel(page), "Edit Sweep the storeroom");
  await page.getByText("Sweep the storeroom").waitFor();
  await page.keyboard.press("Enter");
  await editTitle.fill("Sweep and mop the storeroom");
  await page.locator(".todo-item-editing").getByLabel("Note (optional)").fill("Before opening");
  await page.keyboard.press("Enter");
  await page.getByText("Before opening").waitFor();
  assert.equal(await focusedLabel(page), "Edit Sweep and mop the storeroom");
  await page.screenshot({ path: `${screenshots}/todo-desktop.png`, fullPage: true });

  // Delete with Undo, no dialog; focus moves to the next task.
  page.on("dialog", () => errors.push("a dialog opened"));
  await page.getByRole("button", { name: "Delete Buy packing tape" }).click();
  await page.getByRole("status").filter({ hasText: "Task deleted: Buy packing tape." }).waitFor();
  assert.equal(await page.getByText("Buy packing tape", { exact: true }).count(), 0);
  assert.equal(await focusedLabel(page), await page.getByRole("checkbox", { name: "Plan the weekend sale" }).getAttribute("id"));
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("checkbox", { name: "Buy packing tape" }).waitFor();
  assert.equal(await focusedLabel(page), await page.getByRole("checkbox", { name: "Buy packing tape" }).getAttribute("id"));
  // Without Undo, the notice goes after a few seconds and the task stays deleted.
  await page.getByRole("button", { name: "Delete Plan the weekend sale" }).click();
  await page.getByRole("button", { name: "Undo" }).waitFor();
  await page.getByRole("button", { name: "Undo" }).waitFor({ state: "detached", timeout: 9000 });
  assert.equal(await page.getByText("Plan the weekend sale", { exact: true }).count(), 0);

  // Everything survives a reload, in the same order.
  await page.reload();
  await page.locator(".todo-appbar").getByRole("heading", { level: 1, name: "To-do" }).waitFor();
  assert.deepEqual(await titles(page), ["Pay the supplier", "Buy packing tape", "Sweep and mop the storeroom"]);

  // Every Open is a real link to a new tab, with an icon and hidden "(opens in a new tab)".
  async function checkLaunchLink(link, accessibleName) {
    assert.equal(await link.evaluate((element) => element.tagName), "A");
    assert.equal(await link.getAttribute("href"), "/apps/todo");
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
    assert.equal(await link.locator("svg").count(), 1);
    // The hidden words are in the link but take up no visible space.
    const hidden = await link.locator(".sr-only").boundingBox();
    assert.ok(hidden.width <= 1 && hidden.height <= 1, "(opens in a new tab) is visually hidden");
    assert.equal(await link.evaluate((element) => element.textContent.replace(/\s+/g, " ").trim()), accessibleName);
  }
  await page.goto(baseURL + "/apps");
  const myAppsOpen = page.getByRole("article", { name: "To-do" }).getByRole("link", { name: "Open To-do (opens in a new tab)" });
  await checkLaunchLink(myAppsOpen, "Open To-do (opens in a new tab)");
  // Clicking it opens the app in a second tab and leaves My apps where it was.
  const [popup] = await Promise.all([page.context().waitForEvent("page"), myAppsOpen.click()]);
  await popup.waitForURL("**/apps/todo");
  await popup.locator(".todo-appbar").getByRole("heading", { name: "To-do" }).waitFor();
  assert.equal(await popup.evaluate(() => window.opener), null);
  assert.equal(new URL(page.url()).pathname, "/apps");
  await popup.close();
  await page.goto(baseURL + "/catalogue");
  await checkLaunchLink(page.getByRole("article", { name: "To-do" }).getByRole("link", { name: "Open To-do (opens in a new tab)" }), "Open To-do (opens in a new tab)");
  await page.goto(baseURL + "/catalogue/todo");
  await checkLaunchLink(page.locator(".detail-info").getByRole("link", { name: "Open To-do (opens in a new tab)" }), "Open To-do (opens in a new tab)");
  assert.deepEqual(errors, []);

  // Phone width: one column, no sideways scroll, big enough tap targets.
  const phone = await newPage({ width: 390, height: 844 });
  await phone.page.goto(baseURL + "/apps/todo");
  await phone.page.getByRole("button", { name: "Add To-do" }).click();
  await phone.page.getByLabel("Title").fill("Count the till");
  await phone.page.getByLabel("Title").press("Enter");
  await phone.page.getByText("Count the till").waitFor();
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const deleteBox = await phone.page.getByRole("button", { name: "Delete Count the till" }).boundingBox();
  assert.ok(deleteBox.width >= 44 && deleteBox.height >= 44, "tap target is at least 44 px");
  await phone.page.screenshot({ path: `${screenshots}/todo-phone.png`, fullPage: true });
  assert.deepEqual(phone.errors, []);
  console.log("todo browser check passed");
} finally {
  await browser.close();
}
