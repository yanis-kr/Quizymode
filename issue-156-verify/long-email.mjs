// #156 check: 60-character email on the confirmation step at 195x422, 390x844, 1280x900.
import { createRequire } from "module";
import path from "path";
const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const SPA = "http://localhost:7000";
const CORS = { "access-control-allow-origin": SPA, "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
const b = await chromium.launch();
const email = `${"a".repeat(48)}@example.com`;
for (const [w, h] of [[195, 422], [390, 844], [1280, 900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.route(/cognito-idp/, (r) => { const t = (r.request().headers()["x-amz-target"] ?? "").split(".").pop(); const hd = { ...CORS, "content-type": "application/x-amz-json-1.1" }; if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS }); if (t === "SignUp") return r.fulfill({ status: 200, headers: hd, body: JSON.stringify({ UserConfirmed: false, UserSub: "x", CodeDeliveryDetails: { Destination: "t", DeliveryMedium: "EMAIL", AttributeName: "email" } }) }); return r.fulfill({ status: 400, headers: hd, body: JSON.stringify({ __type: "NotAuthorizedException", message: "s" }) }); });
  await ctx.route(/localhost:\d+\/api\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isUsernameAvailable: true, isEmailAvailable: true }) }));
  const page = await ctx.newPage();
  await page.goto(`${SPA}/signup?reason=save-progress`, { waitUntil: "networkidle" });
  await page.locator("#username").fill("reviewuser"); await page.locator("#email").fill(email); await page.locator("#password").fill("ReviewPassw0rd!"); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^sign up$/i }).click();
  await page.getByRole("heading", { name: /confirm your account/i }).waitFor();
  const m = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  console.log(email.length, "chars", JSON.stringify(m), m.scrollWidth <= m.innerWidth ? "NO OVERFLOW" : "OVERFLOW");
  if (w === 195) await page.screenshot({ path: path.join("screenshots", "after-195x422-long-email-confirmation.png"), fullPage: true });
  await ctx.close();
}
await b.close();
