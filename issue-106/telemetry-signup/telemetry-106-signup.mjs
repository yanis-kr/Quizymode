// #106 telemetry check 2 (signup), partly simulated: a real browser plays the home quick quiz, then walks the real
// signup page against the real local API. ONLY the identity provider is simulated: Playwright answers Cognito's
// SignUp and ConfirmSignUp calls with canned success responses and rejects every other Cognito call (so automatic
// sign-in fails, exercising the "account confirmed, sign in to continue" branch). Usage: node telemetry-106-signup.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
const SPA = "http://localhost:7000";
const CORS = {
  "access-control-allow-origin": SPA,
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "600",
};
const cognitoCalls = [];
const captured = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
});

await context.route(/cognito-idp\.[a-z0-9-]+\.amazonaws\.com/, async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  const target = (request.headers()["x-amz-target"] ?? "").split(".").pop();
  cognitoCalls.push(target);
  const headers = { ...CORS, "content-type": "application/x-amz-json-1.1" };
  if (target === "SignUp") {
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ UserConfirmed: false, UserSub: "00000000-0000-0000-0000-000000000000", CodeDeliveryDetails: { Destination: "t***@e***", DeliveryMedium: "EMAIL", AttributeName: "email" } }) });
  }
  if (target === "ConfirmSignUp") return route.fulfill({ status: 200, headers, body: "{}" });
  return route.fulfill({ status: 400, headers, body: JSON.stringify({ __type: "NotAuthorizedException", message: "simulated: not available in this check" }) });
});

context.on("response", async (response) => {
  const request = response.request();
  if (request.method() === "POST" && request.url().includes("/analytics/events")) {
    let body = null;
    try { body = JSON.parse(request.postData() ?? "null"); } catch { /* ignore */ }
    captured.push({ status: response.status(), events: body?.events?.map((e) => ({ name: e.name, contextType: e.contextType, contextId: e.contextId, runId: e.runId?.slice(0, 8) })) ?? [], sessionId: body?.sessionId });
  }
});

const page = await context.newPage();
const shot = (name) => page.screenshot({ path: path.join(OUT, "screenshots", name), fullPage: true });
let outcome = "ok";
try {
  // 1. Anonymous quiz to the end.
  await page.goto(SPA, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /play a 5-question quiz/i }).click();
  await page.waitForURL(/\/quiz\/collections\//, { timeout: 15000 });
  for (let i = 0; i < 50; i += 1) {
    if (await page.getByText(/You answered every question/i).count()) break;
    const option = page.getByRole("button", { name: /^\s*A\./ }).first();
    await option.waitFor({ timeout: 15000 });
    await option.click();
    await page.waitForTimeout(300);
    if (await page.getByText(/You answered every question/i).count()) break;
    const next = page.getByRole("button", { name: /^next$/i });
    if ((await next.count()) && (await next.isEnabled())) await next.click();
    await page.waitForTimeout(300);
  }
  await page.getByText(/You answered every question/i).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);

  // 2. Same tab: open the signup page the way a prompt would (in-app navigation keeps the tab session).
  await page.evaluate(() => { window.history.pushState({}, "", "/signup?reason=save-progress&returnTo=%2F"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.getByLabel(/display name/i).waitFor({ timeout: 10000 });
  await shot("01-signup-form.png");
  await page.getByLabel(/display name/i).fill("telemetrycheck");
  await page.getByLabel(/^email$/i).fill("telemetry.check@example.com");
  await page.getByLabel(/^password$/i).fill("CheckPassw0rd!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^(sign up|create account)/i }).click();
  await page.getByRole("heading", { name: /confirm your account/i }).waitFor({ timeout: 10000 });
  await shot("02-confirmation-step.png");
  await page.getByLabel(/confirmation code/i).fill("123456");
  await page.getByRole("button", { name: /confirm/i }).first().click();
  await page.getByText(/account confirmed/i).waitFor({ timeout: 10000 });
  await shot("03-account-confirmed-sign-in.png");
  await page.waitForTimeout(1500);
} catch (error) {
  outcome = `error: ${error.message}`;
  await shot("error.png");
} finally {
  const sessionId = await page.evaluate(() => sessionStorage.getItem("quizymode.analytics.session-id")).catch(() => null);
  fs.writeFileSync(path.join(OUT, "telemetry-requests.json"), JSON.stringify({ outcome, sessionId, cognitoCalls, captured }, null, 2));
  console.log(JSON.stringify({ outcome, sessionId, cognitoCalls, sent: captured.flatMap((c) => c.events.map((e) => e.name)), statuses: captured.map((c) => c.status) }));
  await browser.close();
}
