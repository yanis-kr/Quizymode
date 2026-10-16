// #109 production check: anonymous visitor on www.quizymode.com plays the home quick quiz to the end, sees the
// save-progress prompt, clicks "Create a free account" (lands on /signup). NO account is created. Usage: node prod-prompt.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
const captured = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" });
context.on("response", (r) => { const q = r.request(); if (q.url().includes("/analytics/events")) { let b = null; try { b = JSON.parse(q.postData() ?? "null"); } catch {} captured.push({ status: r.status(), events: b?.events?.map((e) => ({ name: e.name, ctx: e.contextId })) ?? [], sessionId: b?.sessionId }); } });
const page = await context.newPage();
const shot = (n, full = true) => page.screenshot({ path: path.join(OUT, "screenshots", n), fullPage: full });
let outcome = "ok";
try {
  await page.goto("https://www.quizymode.com", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /play a 5-question quiz/i }).click();
  await page.waitForURL(/\/quiz\/collections\//, { timeout: 20000 });
  for (let i = 0; i < 50; i += 1) {
    if (await page.getByText(/You answered every question/i).count()) break;
    const o = page.getByRole("button", { name: /^\s*A\./ }).first();
    await o.waitFor({ timeout: 20000 }); await o.click(); await page.waitForTimeout(400);
    if (await page.getByText(/You answered every question/i).count()) break;
    const n = page.getByRole("button", { name: /^next$/i });
    if ((await n.count()) && (await n.isEnabled())) await n.click();
    await page.waitForTimeout(400);
  }
  await page.getByText(/You answered every question/i).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /view results/i }).click();
  await page.getByRole("heading", { name: /make your next quiz yours/i }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await shot("01-quiz-complete-prompt.png");
  await page.getByRole("link", { name: /create a free account/i }).click();
  await page.waitForURL(/\/signup/, { timeout: 10000 });
  outcome = "ok url=" + page.url();
  await page.waitForTimeout(2000);
  await shot("02-signup-after-click.png");
} catch (e) { outcome = `error: ${e.message}`; await shot("error.png"); }
finally {
  const sid = await page.evaluate(() => sessionStorage.getItem("quizymode.analytics.session-id")).catch(() => null);
  fs.writeFileSync(path.join(OUT, "requests.json"), JSON.stringify({ outcome, sid, captured }, null, 2));
  console.log(JSON.stringify({ outcome, sid, sent: captured.flatMap((c) => c.events.map((e) => e.name + (e.ctx ? ":" + e.ctx : ""))), statuses: captured.map((c) => c.status) }));
  await browser.close();
}
