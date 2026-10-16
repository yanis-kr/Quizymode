// #111/#112 local layout + keyboard + a11y review of /signup. Real SPA (main @ merge of #155) in headless Chromium.
// ONLY the identity provider (Cognito) and the availability API are simulated. Usage: node review-signup.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const OUT = process.argv[2];
const SHOTS = path.join(OUT, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const SPA = "http://localhost:7000";
const CORS = { "access-control-allow-origin": SPA, "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-max-age": "600" };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const results = { layout: [], keyboard: {}, a11y: {}, confirmation: {}, notes: [] };

// Cognito mode for the confirmation scenarios.
let confirmMode = "ok"; // ok | badcode
const cognitoCalls = [];
async function newContext(browser, viewport) {
  const ctx = await browser.newContext({ viewport, userAgent: UA });
  await ctx.route(/cognito-idp\.[a-z0-9-]+\.amazonaws\.com/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const target = (req.headers()["x-amz-target"] ?? "").split(".").pop();
    cognitoCalls.push(target);
    const headers = { ...CORS, "content-type": "application/x-amz-json-1.1" };
    if (target === "SignUp") return route.fulfill({ status: 200, headers, body: JSON.stringify({ UserConfirmed: false, UserSub: "00000000-0000-0000-0000-000000000000", CodeDeliveryDetails: { Destination: "t***@e***", DeliveryMedium: "EMAIL", AttributeName: "email" } }) });
    if (target === "ConfirmSignUp") {
      if (confirmMode === "badcode") return route.fulfill({ status: 400, headers, body: JSON.stringify({ __type: "CodeMismatchException", message: "Invalid verification code provided, please try again." }) });
      return route.fulfill({ status: 200, headers, body: "{}" });
    }
    if (target === "ResendConfirmationCode") return route.fulfill({ status: 200, headers, body: JSON.stringify({ CodeDeliveryDetails: { Destination: "t***@e***", DeliveryMedium: "EMAIL", AttributeName: "email" } }) });
    return route.fulfill({ status: 400, headers, body: JSON.stringify({ __type: "NotAuthorizedException", message: "simulated: not available in this check" }) });
  });
  await ctx.route(/localhost:\d+\/api\/users\/availability/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isUsernameAvailable: true, isEmailAvailable: true, usernameError: null, emailError: null }) }));
  await ctx.route(/localhost:\d+\/api\/(?!users\/availability)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  return ctx;
}

const overflowProbe = (page) => page.evaluate(() => ({
  innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
  overflowX: document.documentElement.scrollWidth - window.innerWidth,
}));
const inViewport = (page, locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), fullyInViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth }; });

const browser = await chromium.launch();
try {
  // ---- 1. Layout at each viewport and reason ----
  const viewports = [
    { name: "mobile-390x844", w: 390, h: 844 },
    { name: "desktop-1280x900", w: 1280, h: 900 },
    { name: "desktop-200pct-640x450", w: 640, h: 450 },
    { name: "mobile-200pct-195x422", w: 195, h: 422 },
  ];
  const reasons = [
    { key: "default", q: "" },
    { key: "save-progress", q: "?reason=save-progress&returnTo=%2F" },
    { key: "keep-collection", q: "?reason=keep-collection&returnTo=%2Fcollections%2Fabc" },
    { key: "create-content", q: "?reason=create-content" },
    { key: "join-discussion", q: "?reason=join-discussion" },
    { key: "unknown-script", q: "?reason=%3Cscript%3Ealert(1)%3C%2Fscript%3E" },
  ];
  for (const vp of viewports) {
    for (const r of reasons) {
      // Full reason sweep at the two standard viewports; zoom viewports use default + save-progress.
      if (vp.name.includes("200pct") && !["default", "save-progress"].includes(r.key)) continue;
      const ctx = await newContext(browser, { width: vp.w, height: vp.h });
      const page = await ctx.newPage();
      await page.goto(`${SPA}/signup${r.q}`, { waitUntil: "networkidle" });
      await page.getByLabel(/display name/i).waitFor({ timeout: 10000 });
      const heading = (await page.getByRole("heading").first().innerText()).trim();
      const body = (await page.locator("form").locator("xpath=preceding-sibling::div[1]//p").first().innerText().catch(() => "")).trim();
      const submit = page.getByRole("button", { name: /^sign up$/i });
      const box = await inViewport(page, submit);
      const ov = await overflowProbe(page);
      const rawHtml = await page.content();
      results.layout.push({ viewport: vp.name, reason: r.key, heading, body, ...ov, submitBeforeScroll: box, scriptReflected: rawHtml.includes("<script>alert") });
      if (["default", "save-progress"].includes(r.key) || vp.name.startsWith("mobile-390")) await page.screenshot({ path: path.join(SHOTS, `${vp.name}-${r.key}.png`), fullPage: true });
      // Submit reachable after scrolling.
      await submit.scrollIntoViewIfNeeded();
      results.layout[results.layout.length - 1].submitAfterScroll = await inViewport(page, submit);
      await ctx.close();
    }
  }

  // ---- 2. Keyboard flow on desktop (and mobile width) ----
  for (const vp of [{ name: "desktop", w: 1280, h: 900 }, { name: "mobile", w: 390, h: 844 }]) {
    const ctx = await newContext(browser, { width: vp.w, height: vp.h });
    const page = await ctx.newPage();
    await page.goto(`${SPA}/signup?reason=save-progress&returnTo=%2F`, { waitUntil: "networkidle" });
    await page.getByLabel(/display name/i).waitFor();
    const order = [];
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press("Tab");
      const d = await page.evaluate(() => {
        const el = document.activeElement; if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const lbl = el.labels && el.labels[0] ? el.labels[0].innerText.trim() : null;
        return { tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), id: el.id || null, label: lbl, aria: el.getAttribute("aria-label"), text: (el.innerText || "").trim().slice(0, 40), href: el.getAttribute("href"), autocomplete: el.getAttribute("autocomplete"), outline: cs.outlineStyle + " " + cs.outlineWidth, boxShadow: cs.boxShadow.slice(0, 60) };
      });
      if (d) order.push(d);
    }
    results.keyboard[vp.name] = order;
    if (vp.name === "desktop") {
      // Focus the password toggle and operate it with the keyboard.
      await page.getByLabel(/^password$/i).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      results.keyboard.passwordToggleViaKeyboard = await page.getByLabel(/^password$/i).getAttribute("type");
      await page.screenshot({ path: path.join(SHOTS, "desktop-1280x900-keyboard-focus-password-toggle.png") });
      await page.keyboard.press("Enter"); // hide again
      // Toggle the legal checkbox with Space.
      await page.getByRole("checkbox").focus();
      await page.keyboard.press("Space");
      results.keyboard.checkboxViaSpace = await page.getByRole("checkbox").isChecked();
      await page.screenshot({ path: path.join(SHOTS, "desktop-1280x900-keyboard-focus-checkbox.png") });
      // Legal links navigate.
      const termsHref = await page.getByRole("link", { name: /terms of service/i }).getAttribute("href");
      const privacyHref = await page.getByRole("link", { name: /privacy policy/i }).getAttribute("href");
      results.keyboard.legalLinks = { termsHref, privacyHref };
      await page.getByRole("link", { name: /terms of service/i }).click();
      await page.waitForURL(/\/terms/, { timeout: 10000 });
      results.keyboard.termsNavigated = page.url();
    }
    await ctx.close();
  }

  // ---- 3. A11y associations and error handling ----
  {
    const ctx = await newContext(browser, { width: 1280, height: 900 });
    const page = await ctx.newPage();
    await page.goto(`${SPA}/signup?reason=save-progress&returnTo=%2F`, { waitUntil: "networkidle" });
    await page.getByLabel(/display name/i).waitFor();
    results.a11y.fields = await page.evaluate(() => [...document.querySelectorAll("input,button")].map((el) => ({ tag: el.tagName.toLowerCase(), id: el.id || null, type: el.getAttribute("type"), label: el.labels?.[0]?.innerText.trim().slice(0, 60) ?? null, ariaLabel: el.getAttribute("aria-label"), autocomplete: el.getAttribute("autocomplete"), required: el.required ?? null, describedBy: el.getAttribute("aria-describedby"), invalid: el.getAttribute("aria-invalid") })));
    results.a11y.requirementsHintBeforeSubmit = await page.getByText(/at least 8 characters\./i).count();
    // Submit with a too-short password and the checkbox accepted: observe how the error is exposed.
    await page.getByLabel(/display name/i).fill("reviewuser");
    await page.getByLabel(/^email$/i).fill("review.user@example.com");
    await page.getByLabel(/^password$/i).fill("short");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^sign up$/i }).click();
    await page.waitForTimeout(500);
    results.a11y.shortPasswordError = await page.evaluate(() => {
      const el = document.querySelector(".bg-red-50 .text-red-800");
      const pw = document.getElementById("password");
      return el ? { text: el.textContent, role: el.getAttribute("role") ?? el.parentElement?.getAttribute("role") ?? null, ariaLive: el.getAttribute("aria-live") ?? el.parentElement?.getAttribute("aria-live") ?? null, passwordDescribedBy: pw?.getAttribute("aria-describedby"), passwordInvalid: pw?.getAttribute("aria-invalid"), nativeValidationMessage: pw?.validationMessage ?? null, focused: document.activeElement?.id ?? document.activeElement?.tagName } : { text: null, nativeValidationMessage: pw?.validationMessage ?? null, focused: document.activeElement?.id ?? document.activeElement?.tagName };
    });
    await page.screenshot({ path: path.join(SHOTS, "desktop-1280x900-short-password-error.png"), fullPage: true });
    await ctx.close();
  }

  // ---- 4. Confirmation step, bad code, resend cooldown, reload recovery, account-confirmed fallback ----
  async function toConfirmation(page) {
    await page.goto(`${SPA}/signup?reason=save-progress&returnTo=%2F`, { waitUntil: "networkidle" });
    await page.getByLabel(/display name/i).fill("reviewuser");
    await page.getByLabel(/^email$/i).fill("review.user@example.com");
    await page.getByLabel(/^password$/i).fill("ReviewPassw0rd!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^sign up$/i }).click();
    await page.getByRole("heading", { name: /confirm your account/i }).waitFor({ timeout: 10000 });
  }
  for (const vp of [{ name: "mobile-390x844", w: 390, h: 844 }, { name: "desktop-1280x900", w: 1280, h: 900 }]) {
    const ctx = await newContext(browser, { width: vp.w, height: vp.h });
    const page = await ctx.newPage();
    confirmMode = "badcode";
    await toConfirmation(page);
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-confirmation-step.png`), fullPage: true });
    const codeInput = page.getByLabel(/confirmation code/i);
    const c = {};
    c.codeInput = await codeInput.evaluate((el) => ({ autocomplete: el.getAttribute("autocomplete"), inputMode: el.getAttribute("inputmode"), type: el.type, autofocus: document.activeElement === el }));
    c.overflow = await overflowProbe(page);
    await codeInput.fill("000000");
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await page.waitForTimeout(600);
    c.badCode = await page.evaluate(() => { const e = document.querySelector(".bg-red-50 .text-red-800"); return e ? { text: e.textContent, role: e.getAttribute("role") ?? e.parentElement?.getAttribute("role") ?? null, ariaLive: e.getAttribute("aria-live") ?? e.parentElement?.getAttribute("aria-live") ?? null, url: location.pathname } : null; });
    c.stillOnConfirmation = await page.getByRole("heading", { name: /confirm your account/i }).count();
    c.emailKept = await page.getByText(/review\.user@example\.com/).count();
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-confirmation-bad-code.png`), fullPage: true });
    // Resend and cooldown.
    // A cooldown starts as soon as the first code is delivered, so the resend button is already disabled here.
    c.resendButtonText = (await page.getByRole("button", { name: /resend code/i }).innerText()).trim();
    c.resendDisabled = await page.getByRole("button", { name: /resend code/i }).isDisabled();
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-confirmation-resend-cooldown.png`), fullPage: true });
    // Reload: recovery.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    c.afterReload = {
      confirmationShown: await page.getByRole("heading", { name: /confirm your account/i }).count(),
      emailShown: await page.getByText(/review\.user@example\.com/).count(),
      storage: await page.evaluate(() => { const o = {}; for (let i = 0; i < sessionStorage.length; i += 1) { const k = sessionStorage.key(i); if (/signup|recover/i.test(k)) o[k] = sessionStorage.getItem(k); } return o; }),
    };
    c.storageContainsSecrets = JSON.stringify(c.afterReload.storage).match(/ReviewPassw0rd|000000/) !== null;
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-confirmation-after-reload.png`), fullPage: true });
    // Good code -> auto sign-in rejected -> "Account confirmed".
    confirmMode = "ok";
    await page.getByLabel(/confirmation code/i).fill("123456");
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await page.getByRole("heading", { name: /account confirmed/i }).waitFor({ timeout: 10000 });
    c.confirmed = { overflow: await overflowProbe(page), signInHref: await page.locator("main a.w-full, a.w-full").filter({ hasText: /sign in/i }).first().getAttribute("href") };
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-account-confirmed.png`), fullPage: true });
    // Mobile: a keyboard-only tab to the Sign in link.
    results.confirmation[vp.name] = c;
    await ctx.close();
  }
  // Confirmation + confirmed at 200% zoom phone width.
  {
    const ctx = await newContext(browser, { width: 195, height: 422 });
    const page = await ctx.newPage();
    confirmMode = "ok";
    await toConfirmation(page);
    results.confirmation["mobile-200pct-195x422"] = { overflow: await overflowProbe(page) };
    await page.screenshot({ path: path.join(SHOTS, "mobile-200pct-195x422-confirmation-step.png"), fullPage: true });
    await ctx.close();
  }
  results.cognitoCalls = cognitoCalls;
} catch (error) {
  results.error = String(error.stack ?? error);
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(results.error ?? "done");
  await browser.close();
}
