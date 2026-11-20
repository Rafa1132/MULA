// Optional Playwright check of onboarding and Settings against a running backend. Onboarding is
// scripted, so no model is called; it creates two accounts and starts without sound, so no voice
// is generated either. Needs the client (MULA_TEST_URL).
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });

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
    let background = null;
    for (let node = element; node; node = node.parentElement) {
      const colour = rgb(getComputedStyle(node).backgroundColor);
      if (colour.a === 1) { background = colour; break; }
    }
    background ??= rgb(getComputedStyle(document.body).backgroundColor);
    const text = rgb(getComputedStyle(element).color);
    const mixed = { r: text.r * text.a + background.r * (1 - text.a), g: text.g * text.a + background.g * (1 - text.a), b: text.b * text.a + background.b * (1 - text.a) };
    const [light, dark] = [luminance(mixed), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  });
}

function focused(page) {
  return page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent);
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await page.request.post(baseURL + "/api/auth/signup", { data: { username: `onboardingcheck_${Date.now()}`, password: "test-only-password-123" } });
  assert.equal(signup.status(), 201);
  await page.goto(baseURL + "/workspace#assistant");
  // A new account: "Tap to begin" has the focus once the orb is in; this run starts without sound.
  const begin = page.getByRole("button", { name: "Tap to begin" });
  await begin.waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === "Tap to begin");
  await page.getByRole("button", { name: "Start without sound" }).click();
  let log = page.getByRole("log", { name: "Conversation with Operator" });
  await log.getByText("I'm your assistant across every business you run here.").waitFor();

  // The first question names the assistant; the name shows above the orb and in the chat.
  await page.getByLabel("What would you like to call me?").fill("Sari");
  await page.keyboard.press("Enter");
  log = page.getByRole("log", { name: "Conversation with Sari" });
  await log.getByText("What should I call you?").waitFor();
  assert.equal(await page.locator(".chat-name").innerText(), "SARI");
  assert.ok((await log.locator(".chat-speaker").allInnerTexts()).every((name) => name === "Sari"));

  // Keyboard only: type, Enter, and the next question takes the focus.
  const answer = page.getByLabel("What should I call you?");
  await answer.focus();
  await page.keyboard.type("Rafa");
  await page.keyboard.press("Enter");
  await log.getByText("What does your business do?").waitFor();
  await log.locator(".from-user").filter({ hasText: "Rafa" }).waitFor();
  assert.equal(await focused(page), "onboarding-answer");
  // Contact details are refused, and the question stays open.
  await page.keyboard.type("Email me at rafa@example.com");
  await page.keyboard.press("Enter");
  await page.getByRole("alert").filter({ hasText: "Email addresses and phone numbers" }).waitFor();
  await page.getByLabel("What does your business do?").fill("");
  await page.getByRole("button", { name: "Skip this question" }).click();
  await log.getByText("Skipped").waitFor();
  await page.getByLabel("What would you like help with first?").fill("Planning stock");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByLabel("How do you like answers?").fill("Short and direct");
  await page.getByRole("button", { name: "Send message" }).click();

  // The summary, then an edit to it.
  await log.getByText("Does it look right?").waitFor();
  const summary = page.locator(".assistant-summary");
  assert.equal(await summary.locator("dd").allInnerTexts().then((texts) => texts.join("|")), "Rafa|Not given|Planning stock|Short and direct");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Business").fill("A coffee cart in Bandung");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Personality, by keyboard: arrow keys move within a radio group.
  await log.getByText("how should I talk to you?").waitFor();
  // The log follows the conversation: its newest line is in view, not scrolled past.
  assert.equal(await log.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 2), true, "log scrolled to the newest line");
  const english = page.getByRole("radio", { name: "English" });
  assert.equal(await english.isChecked(), true);
  await english.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("radio", { name: "Bahasa Indonesia" }).isChecked(), true);
  await page.screenshot({ path: `${screenshots}/onboarding-personality.png`, fullPage: true });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Thanks, Rafa, you're all set." }).waitFor();
  await page.getByLabel("Message Sari").waitFor();
  for (const locator of [log.locator(".chat-line").first(), page.locator(".chat-notice"), page.locator(".chat-name"), page.locator(".entry-cue")]) {
    const ratio = await contrastOf(locator);
    assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)}`);
  }
  // Done means done: a reload goes straight to the chat.
  await page.reload();
  await page.getByLabel("Message Sari").waitFor();
  assert.equal(await page.getByRole("button", { name: "Skip for now" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Tap to begin" }).count(), 0, "the welcome plays once");

  // Settings: what was saved, a change to it, and a restart.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
  assert.equal(await page.getByLabel("Business").inputValue(), "A coffee cart in Bandung");
  assert.equal(await page.getByRole("radio", { name: "Bahasa Indonesia" }).isChecked(), true);
  // Your assistant: the name given in onboarding, then renamed back to the default.
  const assistantSection = page.locator(".settings-section").first();
  assert.equal(await page.getByLabel("Assistant's name").inputValue(), "Sari");
  assert.equal(await assistantSection.getByRole("checkbox").isChecked(), true);
  await page.getByLabel("Assistant's name").fill("");
  await assistantSection.getByRole("button", { name: "Save" }).click();
  await assistantSection.getByRole("status").filter({ hasText: "called Operator" }).waitFor();
  const aboutSection = page.locator(".settings-section").nth(1);
  await page.getByLabel("Name", { exact: true }).fill("my password is hunter2");
  await aboutSection.getByRole("button", { name: "Save" }).click();
  await page.getByRole("alert").filter({ hasText: "never kept in your profile" }).waitFor();
  await page.getByLabel("Name", { exact: true }).fill("Rafa A.");
  await aboutSection.getByRole("button", { name: "Save" }).click();
  await aboutSection.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await page.getByRole("radio", { name: "Some emoji" }).check();
  await page.locator(".settings-section").nth(2).getByRole("button", { name: "Save" }).click();
  await page.getByRole("status").filter({ hasText: "uses it from the next message" }).waitFor();
  for (const locator of [page.locator(".settings-lead"), page.locator(".about-hint"), page.locator(".personality-form legend").first()]) {
    const ratio = await contrastOf(locator);
    assert.ok(ratio >= 4.5, `settings contrast ${ratio.toFixed(2)}`);
  }
  await page.screenshot({ path: `${screenshots}/settings-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Restart the questions" }).click();
  await page.waitForURL("**/workspace#assistant");
  // A restart asks the questions again but does not replay the welcome.
  await page.getByLabel("What would you like to call me?").waitFor();
  assert.equal(await page.getByRole("button", { name: "Tap to begin" }).count(), 0);

  // Skip for now: every question at once, and the workspace still works.
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("status").filter({ hasText: "Everything works without it" }).waitFor();
  await page.getByRole("heading", { level: 2, name: "Your projects" }).waitFor();
  assert.deepEqual(errors, []);

  // Phone width: onboarding and Settings fit without scrolling sideways.
  const phone = await browser.newPage({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  await phone.request.post(baseURL + "/api/auth/signup", { data: { username: `onboardingphone_${Date.now()}`, password: "test-only-password-123" } });
  await phone.goto(baseURL + "/workspace#assistant");
  await phone.getByRole("button", { name: "Start without sound" }).click();
  await phone.getByLabel("What would you like to call me?").waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "workspace fits");
  await phone.screenshot({ path: `${screenshots}/onboarding-phone.png`, fullPage: true });
  await phone.goto(baseURL + "/settings");
  await phone.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "settings fits");
  console.log("Onboarding browser check passed: Tap to begin focus, start without sound, welcome as text, naming the assistant (above the orb, in the chat), keyboard answers with focus, refused contact details, skip one, summary and edit, personality by keyboard, finished state survives reload, Settings (assistant name back to the default, prefilled, refused credential, save, personality), restart without a second welcome, Skip for now, contrast, phone width.");
} finally {
  await browser.close();
}
