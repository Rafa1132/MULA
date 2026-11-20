// Optional Playwright check of the landing page, /login and /register. The API is faked in the
// browser, so it creates no account. Needs the client running (MULA_TEST_URL).
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

// Relative luminance contrast of an element's text against the nearest opaque background.
async function contrastOf(locator) {
  return locator.evaluate((element) => {
    function rgb(value) {
      const numbers = value.match(/[\d.]+/g).map(Number);
      // color(srgb r g b / a) gives 0–1 channels; rgb() gives 0–255.
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
    const style = getComputedStyle(element);
    const text = rgb(style.color);
    const opacity = Number(style.opacity);
    const alpha = text.a * opacity;
    const mixed = { r: text.r * alpha + background.r * (1 - alpha), g: text.g * alpha + background.g * (1 - alpha), b: text.b * alpha + background.b * (1 - alpha) };
    const [light, dark] = [luminance(mixed), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  });
}

async function fakeApi(page, { signedIn = false, relaxed = true } = {}) {
  const calls = [];
  await page.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON?.() ?? null;
    calls.push({ path, body });
    if (path === "/api/auth/rules") return route.fulfill({ json: { relaxed } });
    if (path === "/api/auth/me") {
      if (signedIn) return route.fulfill({ json: { id: "1", username: "owner", conversation_id: "c" } });
      return route.fulfill({ status: 401, json: { detail: "Please sign in." } });
    }
    if (path === "/api/auth/signup" && body.username === "taken") return route.fulfill({ status: 409, json: { detail: "That username is already taken." } });
    if (path === "/api/auth/signup") return route.fulfill({ status: 201, json: { id: "1", username: body.username, conversation_id: "c" } });
    if (path === "/api/auth/login") return route.fulfill({ status: 401, json: { detail: "Incorrect username or password." } });
    return route.fulfill({ status: 404, json: {} });
  });
  // The workspace itself isn't under test here; stop at its door.
  await page.route("**/workspace", (route) => route.fulfill({ contentType: "text/html", body: "<main><h1>Workspace reached</h1></main>" }));
  return calls;
}

async function noSideScroll(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll");
}

try {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fakeApi(page);
    await page.goto(baseURL + "/");
    await page.getByRole("heading", { level: 1, name: "A little clarity for your everyday operations." }).waitFor();
    await page.getByRole("heading", { name: "How it works" }).waitFor();
    assert.equal(await page.getByRole("listitem").count(), 3);
    assert.equal(await page.getByRole("link", { name: "Get started" }).count(), 2);
    assert.equal(await page.getByRole("link", { name: "Log in" }).count(), 3);
    assert.ok(await page.getByText("[PLACEHOLDER", { exact: false }).count() >= 1);
    for (const locator of [page.locator(".landing-lead"), page.locator(".landing-eyebrow"), page.locator(".landing-steps li p").first(),
      page.getByRole("link", { name: "Get started" }).first(), page.locator(".landing-step-number").first()]) {
      const ratio = await contrastOf(locator);
      assert.ok(ratio >= 4.5, `${scheme}: contrast ${ratio.toFixed(2)} for ${await locator.evaluate((element) => element.className)}`);
    }
    await page.screenshot({ path: `${screenshots}/landing-${scheme}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Keyboard: the first stops are the logo, Log in and Get started.
  const keys = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fakeApi(keys);
  await keys.goto(baseURL + "/");
  await keys.keyboard.press("Tab");
  await keys.keyboard.press("Tab");
  assert.equal(await keys.evaluate(() => document.activeElement.textContent), "Log in");
  await keys.keyboard.press("Tab");
  assert.equal(await keys.evaluate(() => document.activeElement.textContent), "Get started");
  await keys.keyboard.press("Enter");
  await keys.waitForURL("**/register");

  // Register, in development mode: any non-empty name and password, then straight to the workspace.
  const calls = await fakeApi(keys);
  await keys.getByRole("heading", { name: "Your beginning starts here" }).waitFor();
  await keys.getByText("Development mode: any username works.").waitFor();
  assert.equal(await keys.getByLabel("Password").getAttribute("minlength"), "1");
  await keys.getByLabel("Username").fill("taken");
  await keys.getByLabel("Password").fill("x");
  await keys.getByRole("button", { name: "Create account" }).click();
  await keys.getByRole("alert").filter({ hasText: "already taken" }).waitFor();
  await keys.getByLabel("Username").fill("A b");
  await keys.getByRole("button", { name: "Create account" }).click();
  // A new account opens at the assistant, where onboarding greets it.
  await keys.waitForURL("**/workspace#assistant");
  assert.deepEqual(calls.filter((call) => call.path === "/api/auth/signup").at(-1).body, { username: "A b", password: "x" });

  // Login with the real rules: the hints say so, and the switch is a link to /register.
  const strict = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fakeApi(strict, { relaxed: false });
  await strict.goto(baseURL + "/login");
  await strict.getByText("At least 10 characters.").waitFor();
  assert.equal(await strict.getByLabel("Password").getAttribute("minlength"), "10");
  await strict.getByLabel("Username").fill("owner");
  await strict.getByLabel("Password").fill("wrong-password-1");
  await strict.getByRole("button", { name: "Log in" }).click();
  await strict.getByRole("alert").filter({ hasText: "Incorrect username or password." }).waitFor();
  assert.equal(await strict.getByRole("link", { name: "Create an account" }).getAttribute("href"), "/register");

  // Signed in already: the landing page offers the workspace, and /login goes straight there.
  const returning = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fakeApi(returning, { signedIn: true });
  await returning.goto(baseURL + "/");
  await returning.getByRole("link", { name: "Go to your workspace" }).first().waitFor();
  await returning.goto(baseURL + "/login");
  await returning.waitForURL("**/workspace");

  // Phone width: everything fits, nothing scrolls sideways.
  const phone = await browser.newPage({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  await fakeApi(phone);
  for (const path of ["/", "/login", "/register"]) {
    await phone.goto(baseURL + path);
    await phone.locator("h1").first().waitFor();
    await noSideScroll(phone);
  }
  await phone.goto(baseURL + "/");
  await phone.screenshot({ path: `${screenshots}/landing-phone.png`, fullPage: true });
  console.log("Landing browser check passed: hero, how it works, placeholders, contrast in both themes, keyboard order, register (relaxed rules, taken name, to the workspace), login (strict rules, error), signed-in shortcuts, phone width.");
} finally {
  await browser.close();
}
