// Optional Playwright check of the workspace's entry screen: the orb's entrance, "Tap to begin"
// and the spoken welcome, mute, captions without audio, naming the assistant, and a project the
// assistant proposes. Every API call is faked in the browser (the welcome audio is a tone made
// here), so it creates nothing, generates no voice and calls no model. Needs the client running
// (MULA_TEST_URL).
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH, args: ["--autoplay-policy=no-user-gesture-required"] });

const PROJECT = "11111111-2222-4333-8444-555555555555";
const NEW_PROJECT = "33333333-4444-4555-8666-777777777777";
const PROPOSAL = "44444444-5555-4666-8777-888888888888";
const GREETING = "Hi, welcome to Mula. I'm your assistant across every business you run here. A few quick questions so I can help you better. Skip any you like, or skip them all for now.";
const QUESTIONS = [
  { id: "assistant_name", question: "What would you like to call me?", placeholder: "For example: Operator, Sari or Kopi" },
  { id: "name", question: "What should I call you?", placeholder: "" },
  { id: "business", question: "What does your business do?", placeholder: "" },
  { id: "help", question: "What would you like help with first?", placeholder: "" },
  { id: "style", question: "How do you like answers?", placeholder: "" },
];

/** A three-second 440 Hz tone as a WAV file: long enough to mute it while it plays. */
function tone() {
  const rate = 22050;
  const samples = rate * 3;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / rate) * 12000), 44 + index * 2);
  return wav;
}
const WELCOME_AUDIO = tone();

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

function onboarding(overrides) {
  return {
    status: "active", finished: null, step: "assistant_name", greeting: GREETING, welcome_pending: true,
    assistant_name: "Operator", assistant_name_given: false, questions: QUESTIONS,
    about: { name: null, business: null, help: null, style: null }, personality: null, personality_options: {},
    ...overrides,
  };
}

function project(id, name, description = null) {
  return { id, name, display_name: name, description, role: "owner", created_at: "2026-11-20T00:00:00Z" };
}

/**
 * The backend, in the browser. `state` is the onboarding state; `speech` is "ok" or "off";
 * `chatDelay` holds the assistant's reply back so the orb's thinking state can be seen.
 */
async function fakeApi(page, { state, speech = "ok", chatDelay = 0, messages = [], proposals = [] }) {
  const calls = [];
  const projects = [project(PROJECT, "Kopi Senja")];
  let current = state;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    calls.push({ path, method: request.method(), body });
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "a1", username: "owner", conversation_id: "c" } });
    if (path === "/api/workspace") return route.fulfill({ json: { id: "w1", name: null, projects, max_projects: 20 } });
    if (path === "/api/onboarding") return route.fulfill({ json: current });
    if (path === "/api/onboarding/welcome") {
      current = { ...current, welcome_pending: false };
      return route.fulfill({ json: current });
    }
    if (path === "/api/onboarding/answer" && body.step === "assistant_name") {
      current = { ...current, step: "name", assistant_name: body.answer, assistant_name_given: true };
      return route.fulfill({ json: current });
    }
    if (path === "/api/speech/welcome") {
      if (speech === "off") return route.fulfill({ status: 503, json: { detail: "AI voice is switched off on this server. Chat still works." } });
      return route.fulfill({ contentType: "audio/wav", body: WELCOME_AUDIO });
    }
    if (path === "/api/orchestrator/conversation") return route.fulfill({ json: { messages, proposals } });
    if (path === "/api/orchestrator/chat") {
      await new Promise((resolve) => setTimeout(resolve, chatDelay));
      const proposal = { id: PROPOSAL, message_id: 9, name: "Roti Pagi", description: "A morning bakery in Bandung.", status: "pending", project_id: null };
      return route.fulfill({ json: { reply: "I can set up “Roti Pagi” for you. Press Create project below to confirm.", truncated: false, message_id: 9, proposals: [proposal] } });
    }
    if (path === `/api/orchestrator/proposals/${PROPOSAL}/confirm`) {
      const created = project(NEW_PROJECT, "Roti Pagi", "A morning bakery in Bandung.");
      projects.push(created);
      return route.fulfill({ json: { proposal: { id: PROPOSAL, message_id: 9, name: "Roti Pagi", description: "A morning bakery in Bandung.", status: "created", project_id: NEW_PROJECT }, project: created } });
    }
    return route.fulfill({ status: 404, json: { detail: "Not faked." } });
  });
  return calls;
}

function activeText(page) {
  return page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent);
}

const orbState = (page) => page.locator(".chat-orb canvas").getAttribute("data-state");

try {
  // 1. A new account, first visit: black, the orb rises in, then "Tap to begin" has the focus.
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const calls = await fakeApi(page, { state: onboarding() });
  await page.goto(baseURL + "/workspace");
  const stage = page.locator(".entry-stage[data-entrance]");
  await stage.waitFor();
  assert.equal(await stage.getAttribute("data-entrance"), "full");
  assert.equal(await page.locator(".entry-stage").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(0, 0, 0)");
  const early = await page.locator(".chat-identity").evaluate((element) => Number(getComputedStyle(element).opacity));
  assert.ok(early < 1, `the orb is still fading in (opacity ${early})`);
  assert.equal(await page.locator(".chat-panel").evaluate((element) => Number(getComputedStyle(element).opacity)), 0, "the chat waits for the orb");
  await page.waitForFunction(() => document.activeElement?.textContent === "Tap to begin", null, { timeout: 6000 });
  assert.equal(await page.locator(".chat-identity").evaluate((element) => getComputedStyle(element).opacity), "1");
  assert.equal(await page.locator(".chat-name").innerText(), "OPERATOR");
  assert.equal(await page.getByRole("log").count(), 0, "no chat before the welcome starts");
  for (const locator of [page.locator(".chat-name"), page.locator(".entry-cue"), page.locator(".entry-quiet"), page.locator(".chat-mute"), page.locator(".workspace-account .text-button")]) {
    const ratio = await contrastOf(locator);
    assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)} for ${await locator.evaluate((element) => element.className)}`);
  }
  await page.screenshot({ path: `${screenshots}/entry-begin.png` });

  // Keyboard: Enter on "Tap to begin" plays the welcome; the orb speaks and the words are in the chat.
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".chat-orb canvas")?.getAttribute("data-state") === "speaking", null, { timeout: 5000 });
  assert.ok(calls.some((call) => call.path === "/api/onboarding/welcome" && call.method === "POST"), "the welcome is marked heard");
  assert.ok(calls.some((call) => call.path === "/api/speech/welcome"));
  const log = page.getByRole("log", { name: "Conversation with Operator" });
  const caption = log.locator(".chat-line").first();
  assert.equal(await caption.locator(".chat-speaker").innerText(), "Operator");
  assert.equal(await caption.locator(".chat-text").innerText(), GREETING, "the caption is the spoken welcome");
  await page.waitForFunction(() => document.activeElement?.id === "onboarding-answer");
  await page.screenshot({ path: `${screenshots}/entry-speaking.png` });

  // Mute stops the welcome at once, and is remembered.
  const mute = page.getByRole("button", { name: "Mute" });
  await mute.click();
  assert.equal(await mute.getAttribute("aria-pressed"), "true");
  await page.waitForFunction(() => document.querySelector(".chat-orb canvas")?.getAttribute("data-state") === "idle", null, { timeout: 2000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("mula.voice-muted")), "true");

  // Naming the assistant: the name shows above the orb and on its chat lines.
  await page.getByLabel("What would you like to call me?").fill("Sari");
  await page.keyboard.press("Enter");
  await page.getByRole("log", { name: "Conversation with Sari" }).getByText("What should I call you?").waitFor();
  assert.equal(await page.locator(".chat-name").innerText(), "SARI");
  assert.ok((await page.locator(".chat-speaker").allInnerTexts()).every((name) => name === "Sari"));

  // The cue scrolls down to the projects.
  await page.getByRole("link", { name: "Your projects" }).click();
  // With one project the page is too short for the section to reach the top, so check it is in view.
  await page.waitForFunction(() => {
    const heading = document.querySelector(".workspace-title").getBoundingClientRect();
    return window.scrollY > 0 && heading.top >= 0 && heading.bottom <= window.innerHeight;
  });
  assert.deepEqual(errors, []);

  // 2. Reduced motion: everything there at once. Tapping the orb also begins, and with no voice
  // on the server the welcome is still there as text, with a note saying why.
  const still = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await fakeApi(still, { state: onboarding(), speech: "off" });
  await still.goto(baseURL + "/workspace");
  await still.getByRole("button", { name: "Tap to begin" }).waitFor();
  assert.equal(await still.locator(".entry-stage").getAttribute("data-entrance"), "none");
  assert.equal(await still.locator(".chat-identity").evaluate((element) => getComputedStyle(element).animationName), "none");
  assert.equal(await activeText(still), "Tap to begin");
  await still.locator(".chat-orb").click();
  await still.getByRole("status").filter({ hasText: "AI voice is switched off on this server" }).waitFor();
  await still.getByRole("log").getByText("I'm your assistant across every business you run here.").waitFor();
  const noteRatio = await contrastOf(still.locator(".entry-voice-note"));
  assert.ok(noteRatio >= 4.5, `voice note contrast ${noteRatio.toFixed(2)}`);

  // 3. Start without sound: no audio is requested at all.
  const quiet = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const quietCalls = await fakeApi(quiet, { state: onboarding() });
  await quiet.goto(baseURL + "/workspace");
  await quiet.getByRole("button", { name: "Start without sound" }).click();
  await quiet.getByRole("log").getByText("I'm your assistant across every business you run here.").waitFor();
  assert.equal(quietCalls.some((call) => call.path === "/api/speech/welcome"), false);
  assert.equal(quietCalls.some((call) => call.path === "/api/onboarding/welcome"), true);

  // 4. A returning owner: a silent orb and the chat, with the focus in the input. The assistant
  // proposes a project; it is created only on "Create project", and its card appears below.
  const back = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const backErrors = [];
  back.on("pageerror", (error) => backErrors.push(error.message));
  const backCalls = await fakeApi(back, { state: onboarding({ status: "done", finished: "completed", step: "done", welcome_pending: false }), chatDelay: 600 });
  await back.goto(baseURL + "/workspace");
  await back.waitForFunction(() => document.activeElement?.id === "assistant-message", null, { timeout: 6000 });
  assert.equal(await back.getByRole("button", { name: "Tap to begin" }).count(), 0);
  assert.equal(await orbState(back), "idle");
  await back.keyboard.type("Set up a project for my bakery, Roti Pagi");
  await back.keyboard.press("Enter");
  await back.waitForFunction(() => document.querySelector(".chat-orb canvas")?.getAttribute("data-state") === "thinking");
  const card = back.getByRole("group", { name: "Roti Pagi" });
  await card.waitFor();
  assert.equal(backCalls.some((call) => call.path.includes("/proposals/")), false, "nothing is created before the button");
  const eyebrowRatio = await contrastOf(card.locator(".proposal-eyebrow"));
  assert.ok(eyebrowRatio >= 4.5, `proposal contrast ${eyebrowRatio.toFixed(2)}`);
  await back.screenshot({ path: `${screenshots}/entry-proposal.png` });
  await card.getByRole("button", { name: "Create project" }).click();
  const open = card.getByRole("link", { name: "Open Roti Pagi" });
  await open.waitFor();
  assert.equal(await open.getAttribute("href"), `/projects/${NEW_PROJECT}`);
  assert.equal(await open.evaluate((element) => element === document.activeElement), true, "focus moves to the new project's link");
  const newCard = back.locator(".project-grid").getByRole("listitem").filter({ hasText: "Roti Pagi" });
  await newCard.waitFor();
  await newCard.getByText("A morning bakery in Bandung.").waitFor();
  assert.deepEqual(backErrors, []);

  // Focus the owner placed during the entrance stays where they put it.
  const tabbed = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fakeApi(tabbed, { state: onboarding({ status: "done", finished: "completed", step: "done", welcome_pending: false }) });
  await tabbed.goto(baseURL + "/workspace");
  const settings = tabbed.getByRole("link", { name: "Settings" });
  await settings.focus();
  await tabbed.waitForTimeout(3200);
  assert.equal(await settings.evaluate((element) => element === document.activeElement), true, "focus is not pulled into the chat");

  // 5. Phone width: the orb, "Tap to begin" and the cue fit on the first screen; nothing scrolls sideways.
  const phone = await browser.newPage({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await fakeApi(phone, { state: onboarding() });
  await phone.goto(baseURL + "/workspace");
  await phone.getByRole("button", { name: "Tap to begin" }).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll");
  assert.equal(await phone.locator(".chat-orb canvas").evaluate((element) => element.getBoundingClientRect().width), 195);
  for (const selector of [".entry-begin-button", ".entry-cue"]) {
    const bottom = await phone.locator(selector).evaluate((element) => element.getBoundingClientRect().bottom);
    assert.ok(bottom <= 760, `${selector} is on the first screen (bottom ${bottom})`);
  }
  await phone.screenshot({ path: `${screenshots}/entry-phone.png` });
  await phone.getByRole("button", { name: "Start without sound" }).tap();
  await phone.getByLabel("What would you like to call me?").waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll with the chat");
  await phone.screenshot({ path: `${screenshots}/entry-phone-chat.png` });

  console.log("Entry browser check passed: black first screen, orb fades in before the chat, focus on Tap to begin, keyboard begin plays the welcome (orb speaking, caption matches), focus to the input, mute stops and is remembered, naming the assistant, cue to the projects, reduced motion, orb tap, voice off falls back to text, start without sound requests no audio, returning owner (silent orb, input focused, thinking state), proposal created only on the button with focus to its link and a new card, focus placed during the entrance is kept, phone width, contrast.");
} finally {
  await browser.close();
}
