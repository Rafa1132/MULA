// Run against an isolated test backend whose runtime is a stand-in that calls the backend's
// ask_agent tool when asked to forecast. This creates an account and agent requests.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://localhost:3001";
const screenshots = process.env.MULA_SCREENSHOT_DIR || "/tmp";
const browser = await chromium.launch({ headless: true, executablePath: process.env.MULA_BROWSER_PATH });
const csv = "date,sales\n" + Array.from({ length: 30 }, (_, index) => `2026-01-${String(index + 1).padStart(2, "0")},${100 + index * 10}`).join("\n");

async function askForForecast(page) {
  await page.locator('input[type="file"]').setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByLabel("Message Mula").fill("Please forecast my daily sales for next week.");
  await page.getByRole("button", { name: "Send message" }).click();
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await page.request.post(baseURL + "/api/auth/signup", { data: { username: `requestscheck_${Date.now()}`, password: "test-only-password-123" } });
  assert.equal(signup.status(), 201);
  await page.goto(baseURL + "/");
  const log = page.getByRole("log", { name: "Chat messages" });
  const cards = log.getByRole("group", { name: "Operator request to Forecasting" });

  // "Ask me first" (the default): the request waits for the owner, who can decline it.
  await askForForecast(page);
  await cards.first().getByText("Forecast daily sales for the next 7 days from the attached CSV.").waitFor();
  await cards.first().getByRole("button", { name: "Not now" }).click();
  await cards.first().getByText("You chose not to ask.").waitFor();

  // Approving runs Forecasting, then the Operator relays its answer as a new reply.
  await askForForecast(page);
  await cards.nth(1).getByRole("button", { name: "Ask Forecasting" }).click();
  await log.getByText("Forecasting expects about 410 per day next week").waitFor();
  await cards.nth(1).getByText("Forecasting answered.", { exact: false }).waitFor();
  await log.getByText("Answer from Forecasting").waitFor();
  await page.screenshot({ path: screenshots + "/mula-request-desktop.png" });

  // Requests come back with the conversation, under the replies that made them.
  await page.reload();
  await cards.nth(1).waitFor();
  await cards.first().getByText("You chose not to ask.").waitFor();
  await cards.nth(1).getByText("Forecasting answered.", { exact: false }).waitFor();
  assert.equal(await cards.getByRole("button", { name: "Ask Forecasting" }).count(), 0);

  // "Go ahead": the answer follows the Operator's reply without a click.
  const team = await page.request.get(baseURL + "/api/team");
  const operator = (await team.json()).agents.find((agent) => agent.id === "operator");
  const saved = await page.request.put(baseURL + "/api/team/operator", { data: { prompt: operator.prompt, data: operator.data, tools: operator.tools, revision: operator.revision, brain: operator.brain, delegation: "auto" } });
  assert.equal(saved.status(), 200);
  await askForForecast(page);
  await cards.nth(2).getByText("Forecasting answered.", { exact: false }).waitFor();
  await log.getByText("Answer from Forecasting").nth(1).waitFor();

  // Phones: the card fits without sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Expand chat" }).click();
  await cards.nth(2).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const box = await cards.nth(2).boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  await page.screenshot({ path: screenshots + "/mula-request-mobile.png" });
  assert.deepEqual(errors, []);
  console.log("Agent requests: decline, approve with relay, reload, go ahead and phone layout passed.");
} finally { await browser.close(); }
