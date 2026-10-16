import { createRequire } from "module";
const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const SPA = "http://localhost:7000";
const CORS = { "access-control-allow-origin": SPA, "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 195, height: 422 } });
await ctx.route(/cognito-idp/, (r) => { const t = (r.request().headers()["x-amz-target"] ?? "").split(".").pop(); const h = { ...CORS, "content-type": "application/x-amz-json-1.1" }; if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS }); if (t === "SignUp") return r.fulfill({ status: 200, headers: h, body: JSON.stringify({ UserConfirmed: false, UserSub: "x", CodeDeliveryDetails: { Destination: "t", DeliveryMedium: "EMAIL", AttributeName: "email" } }) }); return r.fulfill({ status: 400, headers: h, body: JSON.stringify({ __type: "NotAuthorizedException", message: "s" }) }); });
await ctx.route(/localhost:\d+\/api\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isUsernameAvailable: true, isEmailAvailable: true }) }));
const page = await ctx.newPage();
for (const step of ["form", "confirm"]) {
  if (step === "confirm") { await page.locator("#username").fill("reviewuser"); await page.locator("#email").fill("review.user@example.com"); await page.locator("#password").fill("ReviewPassw0rd!"); await page.getByRole("checkbox").check(); await page.getByRole("button", { name: /^sign up$/i }).click(); await page.getByRole("heading", { name: /confirm your account/i }).waitFor(); } else await page.goto(`${SPA}/signup?reason=save-progress`, { waitUntil: "networkidle" });
  console.log(step, JSON.stringify(await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, wide: [...document.querySelectorAll("*")].filter((e) => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0).map((e) => `${e.tagName.toLowerCase()}.${(e.className?.toString() ?? "").slice(0, 50)} sw=${e.scrollWidth} cw=${e.clientWidth} "${(e.innerText ?? "").trim().slice(0, 30)}"`).slice(0, 8) }))));
}
await b.close();
