// Optional Playwright check of the projects part of the workspace page and the project switcher.
// The API is faked in the browser, so it creates nothing; the account has finished onboarding, so
// the entry screen above shows its chat (tests/entry.browser.spec.mjs covers that screen). Needs
// the client running (MULA_TEST_URL).
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

const FIRST = "11111111-2222-4333-8444-555555555555";
const SECOND = "22222222-3333-4444-8555-666666666666";

async function contrastOf(locator) {
  return locator.evaluate((element) => {
    function rgb(value) {
      const numbers = value.match(/[\d.]+/g).map(Number);
      if (value.startsWith("color(")) return { r: numbers[0] * 255, g: numbers[1] * 255, b: numbers[2] * 255, a: numbers[3] ?? 1 };
      return { r: numbers[0], g: numbers[1], b: numbers[2], a: numbers[3] ?? 1 };
    }
    function luminance({ r, g, b }) {
      const channel = (value) => { const s = value / 255; if (s <= 0.03928) return s / 12.92; return ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }
    let node = element;
    let background = null;
    while (node) {
      const colour = rgb(getComputedStyle(node).backgroundColor);
      if (colour.a === 1) { background = colour; break; }
      node = node.parentElement;
    }
    background ??= rgb(getComputedStyle(document.body).backgroundColor);
    let opacity = 1;
    for (let each = element; each; each = each.parentElement) opacity *= Number(getComputedStyle(each).opacity);
    const text = rgb(getComputedStyle(element).color);
    const alpha = text.a * opacity;
    const mixed = { r: text.r * alpha + background.r * (1 - alpha), g: text.g * alpha + background.g * (1 - alpha), b: text.b * alpha + background.b * (1 - alpha) };
    const [light, dark] = [luminance(mixed), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  });
}

// A returning owner: onboarding done, the welcome already heard, an empty conversation.
const ONBOARDED = {
  status: "done", finished: "completed", step: "done", greeting: "Hi.", welcome_pending: false,
  assistant_name: "Operator", assistant_name_given: false, questions: [], about: { name: null, business: null, help: null, style: null },
  personality: null, personality_options: {},
};

function fakeApi(page, { projects }) {
  const calls = [];
  return page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    calls.push({ path, method: request.method(), body });
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "a1", username: "owner", conversation_id: "c" } });
    if (path === "/api/workspace") return route.fulfill({ json: { id: "w1", name: null, projects, max_projects: 20 } });
    if (path === "/api/onboarding") return route.fulfill({ json: ONBOARDED });
    if (path === "/api/orchestrator/conversation") return route.fulfill({ json: { messages: [], proposals: [] } });
    if (path === "/api/projects" && request.method() === "GET") return route.fulfill({ json: projects });
    if (path === "/api/projects" && request.method() === "POST") {
      const name = (body.name ?? "").trim() || null;
      const project = { id: SECOND, name, display_name: name ?? "Untitled project", description: null, role: "owner", created_at: "2026-11-19T00:00:00Z" };
      projects.push(project);
      return route.fulfill({ status: 201, json: project });
    }
    if (path.startsWith("/api/projects/") && request.method() === "PATCH") {
      const name = (body.name ?? "").trim() || null;
      if (name && name.length > 80) return route.fulfill({ status: 422, json: { detail: "Keep the project name to 80 characters." } });
      const project = projects.find((each) => path.endsWith(each.id));
      Object.assign(project, { name, display_name: name ?? "Untitled project" });
      return route.fulfill({ json: project });
    }
    // Project pages' own data isn't under test here.
    return route.fulfill({ status: 404, json: { detail: "Not faked." } });
  }).then(() => calls);
}

function project(id, name) {
  return { id, name, display_name: name ?? "Untitled project", description: null, role: "owner", created_at: "2026-11-18T00:00:00Z" };
}

try {
  // An account with one named project.
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projects = [project(FIRST, "Kopi Senja")];
  const calls = await fakeApi(page, { projects });
  await page.goto(baseURL + "/workspace");
  await page.getByRole("heading", { level: 2, name: "Your projects" }).waitFor();
  // The entrance has finished once the chat input takes the focus; contrast is measured after it.
  await page.waitForFunction(() => document.activeElement?.id === "assistant-message", null, { timeout: 6000 });
  const card = page.getByRole("listitem").filter({ hasText: "Kopi Senja" });
  assert.equal(await card.getByRole("link", { name: "Kopi Senja", exact: true }).getAttribute("href"), `/projects/${FIRST}`);
  assert.equal(await card.getByRole("link", { name: "Open Kopi Senja" }).getAttribute("href"), `/projects/${FIRST}`);
  // Placeholders: reachable and announced as unavailable, and they do nothing.
  const invite = page.getByRole("button", { name: "Invite teammates: coming soon" });
  assert.equal(await invite.getAttribute("aria-disabled"), "true");
  assert.equal(await card.getByRole("button", { name: "Connect GitHub to Kopi Senja: coming soon" }).getAttribute("aria-disabled"), "true");
  await invite.click({ force: true });
  assert.equal(calls.filter((call) => call.method !== "GET").length, 0);

  // Rename, with the keyboard; an empty name shows "Untitled project".
  await card.getByRole("button", { name: "Rename Kopi Senja" }).focus();
  await page.keyboard.press("Enter");
  const nameField = page.getByLabel("Project name");
  assert.equal(await nameField.evaluate((element) => element === document.activeElement), true);
  await nameField.fill("");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Untitled project", exact: true }).waitFor();
  assert.deepEqual(calls.find((call) => call.method === "PATCH").body, { name: "" });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Rename");
  // Escape cancels a rename and gives focus back.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByLabel("Project name").count(), 0);

  for (const locator of [page.locator(".workspace-intro p").last(), page.locator(".project-card-meta").first(), page.locator(".coming-soon-badge").first(),
    page.locator(".workspace-account .text-button"), page.locator(".workspace-eyebrow")]) {
    const ratio = await contrastOf(locator);
    assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)} for ${await locator.evaluate((element) => element.className)}`);
  }
  await page.screenshot({ path: `${screenshots}/workspace-desktop.png`, fullPage: true });

  // New project without a name: it is created untitled and opens.
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const newName = page.getByLabel("Project name (optional)");
  assert.equal(await newName.evaluate((element) => element === document.activeElement), true);
  await page.route(`**/projects/${SECOND}`, (route) => route.fulfill({ contentType: "text/html", body: "<main><h1>Project opened</h1></main>" }));
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(`**/projects/${SECOND}`);
  assert.deepEqual(calls.find((call) => call.method === "POST" && call.path === "/api/projects").body, { name: "" });
  assert.deepEqual(errors, []);

  // A new account with no projects yet.
  const empty = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fakeApi(empty, { projects: [] });
  await empty.goto(baseURL + "/workspace");
  await empty.getByText("No projects yet.").waitFor();

  // A full workspace: New project is off, and the note says why.
  const full = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fakeApi(full, { projects: Array.from({ length: 20 }, (_, index) => project(`${String(index).padStart(8, "0")}-2222-4333-8444-555555555555`, `Shop ${index + 1}`)) });
  await full.goto(baseURL + "/workspace");
  await full.getByText("You have 20 projects, the most a workspace can hold for now.").waitFor();
  assert.equal(await full.getByRole("button", { name: "New project", exact: true }).isDisabled(), true);

  // Old links open the same page in the first project.
  const old = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fakeApi(old, { projects: [project(FIRST, "Kopi Senja"), project(SECOND, null)] });
  await old.route(`**/projects/${FIRST}/memory`, (route) => route.fulfill({ contentType: "text/html", body: "<main><h1>First project's memory</h1></main>" }));
  await old.goto(baseURL + "/memory");
  await old.waitForURL(`**/projects/${FIRST}/memory`);
  await fakeApi(old, { projects: [] });
  await old.goto(baseURL + "/agents");
  await old.waitForURL("**/workspace");

  // The project switcher on a project page: the name, the other projects (same section), and the way back.
  const inside = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fakeApi(inside, { projects: [project(FIRST, "Kopi Senja"), project(SECOND, null)] });
  await inside.goto(baseURL + `/projects/${FIRST}/catalogue`);
  const switcher = inside.locator(".sidebar .project-switcher-button");
  await switcher.filter({ hasText: "Kopi Senja" }).waitFor();
  await switcher.click();
  const list = inside.locator(".sidebar #project-switcher-list");
  assert.equal(await list.getByRole("link", { name: "Untitled project" }).getAttribute("href"), `/projects/${SECOND}/catalogue`);
  assert.equal(await list.getByRole("link", { name: "All projects" }).getAttribute("href"), "/workspace");
  await inside.keyboard.press("Escape");
  assert.equal(await list.isHidden(), true);
  assert.equal(await switcher.evaluate((element) => element === document.activeElement), true);
  const nav = inside.getByRole("navigation", { name: "Project" });
  assert.equal(await nav.getByRole("link", { name: "Chat" }).getAttribute("href"), `/projects/${FIRST}`);
  assert.equal(await nav.getByRole("link", { name: "Catalogue" }).getAttribute("aria-current"), "page");
  assert.equal(await nav.getByRole("link", { name: "Memory" }).getAttribute("href"), `/projects/${FIRST}/memory`);

  // Phone width: one column, nothing scrolls sideways.
  const phone = await browser.newPage({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  await fakeApi(phone, { projects: [project(FIRST, "A very long project name that has to wrap on a phone screen")] });
  await phone.goto(baseURL + "/workspace");
  await phone.getByRole("heading", { level: 2, name: "Your projects" }).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll");
  await phone.screenshot({ path: `${screenshots}/workspace-phone.png`, fullPage: true });
  console.log("Workspace browser check passed: project cards and links, Coming soon placeholders, rename (keyboard, untitled, Escape), contrast, new untitled project opens, empty workspace, full workspace, old links to the first project, project switcher (name, same section, Escape, nav), phone width.");
} finally {
  await browser.close();
}
