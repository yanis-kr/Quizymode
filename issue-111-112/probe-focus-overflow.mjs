// Follow-up probes for #111/#112: focus-indicator visibility on each control and the source of the 195px confirmation-step overflow.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const OUT = process.argv[2];
const SPA = "http://localhost:7000";
const CORS = { "access-control-allow-origin": SPA, "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
const browser = await chromium.launch();
const out = { focus: [], overflow: null };
async function ctxFor(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" });
  await ctx.route(/cognito-idp/, (r) => { const m = r.request().method(); const t = (r.request().headers()["x-amz-target"] ?? "").split(".").pop(); const headers = { ...CORS, "content-type": "application/x-amz-json-1.1" }; if (m === "OPTIONS") return r.fulfill({ status: 204, headers: CORS }); if (t === "SignUp") return r.fulfill({ status: 200, headers, body: JSON.stringify({ UserConfirmed: false, UserSub: "x", CodeDeliveryDetails: { Destination: "t***@e***", DeliveryMedium: "EMAIL", AttributeName: "email" } }) }); return r.fulfill({ status: 400, headers, body: JSON.stringify({ __type: "NotAuthorizedException", message: "sim" }) }); });
  await ctx.route(/localhost:\d+\/api\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isUsernameAvailable: true, isEmailAvailable: true }) }));
  return ctx;
}
{
  const ctx = await ctxFor(1280, 900); const page = await ctx.newPage();
  await page.goto(`${SPA}/signup?reason=save-progress`, { waitUntil: "networkidle" });
  const targets = [["display name", page.locator("#username")], ["email", page.locator("#email")], ["password", page.locator("#password")], ["show-password toggle", page.getByLabel(/show password/i)], ["legal checkbox", page.getByRole("checkbox")], ["terms link", page.getByRole("link", { name: /terms of service/i })], ["sign up button", page.getByRole("button", { name: /^sign up$/i })]];
  for (const [name, loc] of targets) {
    await loc.focus();
    const s = await loc.evaluate((el) => { const cs = getComputedStyle(el); return { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, boxShadow: cs.boxShadow, borderColor: cs.borderColor, focusVisible: el.matches(":focus-visible") }; });
    out.focus.push({ control: name, ...s });
    const safe = name.replace(/[^a-z]+/g, "-");
    await page.screenshot({ path: path.join(OUT, "screenshots", `focus-${safe}.png`), clip: { x: 390, y: 60, width: 500, height: 840 } });
  }
  await ctx.close();
}
{
  const ctx = await ctxFor(195, 422); const page = await ctx.newPage();
  await page.goto(`${SPA}/signup?reason=save-progress`, { waitUntil: "networkidle" });
  await page.locator("#username").fill("reviewuser"); await page.locator("#email").fill("review.user@example.com"); await page.locator("#password").fill("ReviewPassw0rd!"); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^sign up$/i }).click();
  await page.getByRole("heading", { name: /confirm your account/i }).waitFor();
  out.overflow = await page.evaluate(() => { const vw = window.innerWidth; const bad = [...document.querySelectorAll("body *")].map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName.toLowerCase(), cls: (el.className?.toString() ?? "").slice(0, 60), text: (el.innerText ?? "").trim().slice(0, 40), right: Math.round(r.right), width: Math.round(r.width) }; }).filter((e) => e.right > vw + 0.5); return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: bad.slice(0, 12) }; });
  await ctx.close();
}
fs.writeFileSync(path.join(OUT, "probe-results.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
await browser.close();
