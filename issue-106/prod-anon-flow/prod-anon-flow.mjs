// #106 production check: anonymous visitor on https://www.quizymode.com plays the home quick quiz to the end, then opens
// /signup in the same tab and focuses the form. NO account is created (the form is never submitted). Records every
// analytics request/response the browser makes. Usage: node prod-anon-flow.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
const SITE = "https://www.quizymode.com";
const captured = []; const failures = []; const console_ = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" });
context.on("response", async (r) => {
  const q = r.request();
  if (q.url().includes("/analytics/events")) {
    let body = null; try { body = JSON.parse(q.postData() ?? "null"); } catch {}
    let resp = ""; try { resp = (await r.text()).slice(0, 300); } catch {}
    captured.push({ t: new Date().toISOString(), url: q.url(), method: q.method(), status: r.status(), events: body?.events?.map((e) => e.name) ?? [], sessionId: body?.sessionId, resp });
  }
});
context.on("requestfailed", (q) => { if (q.url().includes("analytics")) failures.push({ url: q.url(), err: q.failure()?.errorText }); });
const page = await context.newPage();
page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && /analytic/i.test(m.text())) console_.push(m.text().slice(0, 300)); });
const shot = (n) => page.screenshot({ path: path.join(OUT, "screenshots", n), fullPage: true });
let outcome = "ok";
try {
  await page.goto(SITE, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /play a 5-question quiz/i }).click();
  await page.waitForURL(/\/quiz\/collections\//, { timeout: 20000 });
  for (let i = 0; i < 50; i += 1) {
    if (await page.getByText(/You answered every question/i).count()) break;
    const option = page.getByRole("button", { name: /^\s*A\./ }).first();
    await option.waitFor({ timeout: 20000 }); await option.click(); await page.waitForTimeout(400);
    if (await page.getByText(/You answered every question/i).count()) break;
    const next = page.getByRole("button", { name: /^next$/i });
    if ((await next.count()) && (await next.isEnabled())) await next.click();
    await page.waitForTimeout(400);
  }
  await page.getByText(/You answered every question/i).waitFor({ timeout: 20000 });
  await page.waitForTimeout(2000);
  await shot("01-quiz-complete.png");
  const sid1 = await page.evaluate(() => sessionStorage.getItem("quizymode.analytics.session-id"));
  await page.evaluate(() => { window.history.pushState({}, "", "/signup?reason=save-progress&returnTo=%2F"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.getByLabel(/display name/i).waitFor({ timeout: 15000 });
  await page.getByLabel(/display name/i).focus();
  await page.waitForTimeout(2500);
  await shot("02-signup-form-focused.png");
  var sid2 = await page.evaluate(() => sessionStorage.getItem("quizymode.analytics.session-id"));
  var sid1v = sid1;
} catch (e) { outcome = `error: ${e.message}`; await shot("error.png"); }
finally {
  fs.writeFileSync(path.join(OUT, "requests.json"), JSON.stringify({ outcome, sessionStart: typeof sid1v !== "undefined" ? sid1v : null, sessionEnd: typeof sid2 !== "undefined" ? sid2 : null, captured, failures, console_ }, null, 2));
  console.log(JSON.stringify({ outcome, sessions: [sid1v, sid2], sent: captured.flatMap((c) => c.events), statuses: captured.map((c) => c.status), failures, console_ }));
  await browser.close();
}
