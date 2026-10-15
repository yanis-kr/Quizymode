// #106 telemetry check: an anonymous visitor plays the home quick quiz to the end in a real browser.
// Usage: node telemetry-106.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const SPA = "http://localhost:7000";
const captured = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
});
context.on("response", async (response) => {
  const request = response.request();
  if (request.method() === "POST" && request.url().includes("/api/analytics/events")) {
    let body = null;
    try { body = JSON.parse(request.postData() ?? "null"); } catch { /* ignore */ }
    let result = null;
    try { result = await response.json(); } catch { /* ignore */ }
    captured.push({ status: response.status(), request: body, response: result });
  }
});

const page = await context.newPage();
let outcome = "ok";
try {
  await page.goto(SPA, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /play a 5-question quiz/i }).click();
  await page.waitForURL(/\/quiz\/collections\//, { timeout: 15000 });

  for (let question = 0; question < 50; question += 1) {
    if (await page.getByText(/You answered every question/i).count()) break;
    const option = page.getByRole("button", { name: /^\s*A\./ }).first();
    await option.waitFor({ timeout: 15000 });
    await option.click();
    await page.waitForTimeout(300);
    if (await page.getByText(/You answered every question/i).count()) break;
    const next = page.getByRole("button", { name: /^next$/i });
    if (await next.count() && await next.isEnabled()) {
      await next.click();
    }
    await page.waitForTimeout(300);
  }
  await page.getByText(/You answered every question/i).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500); // let the event batch flush
  await page.screenshot({ path: path.join(OUT, "08-home-quiz-completed.png"), fullPage: true });

  await page.getByRole("button", { name: /view results/i }).click();
  await page.getByRole("button", { name: /play again/i }).click();
  await page.waitForTimeout(2000);
} catch (error) {
  outcome = `error: ${error.message}`;
  await page.screenshot({ path: path.join(OUT, "error.png"), fullPage: true });
} finally {
  const sessionId = await page.evaluate(() => sessionStorage.getItem("quizymode.analytics.session-id")).catch(() => null);
  fs.writeFileSync(path.join(OUT, "telemetry-requests.json"), JSON.stringify({ outcome, sessionId, captured }, null, 2));
  console.log(JSON.stringify({ outcome, sessionId, requests: captured.length, events: captured.flatMap((c) => c.request?.events?.map((e) => `${e.name}:${e.runId?.slice(0, 8)}:${e.contextType}`) ?? []), statuses: captured.map((c) => c.status) }));
  await browser.close();
}
