// Browser evidence for #109 (contextual signup prompt) against the local stack:
// SPA :7000 -> API :8082 -> throwaway Postgres; signed-in identity from the local test issuer :7443 (not Cognito).
// Usage: node evidence-109.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
const SPA = "http://localhost:7000";
const IDP = "https://localhost:7443";
const CLIENT = "quizymode-local-evidence";
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const PROMPT = '[data-testid="signup-prompt"]';

const results = [];
const captured = [];
const sessions = {};
function record(step, pass, detail) {
  results.push({ step, outcome: pass ? "PASS" : "FAIL", detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${step} ${detail ? JSON.stringify(detail) : ""}`);
}
async function newContext(browser, label, viewport) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, userAgent: CHROME_UA });
  context.on("response", async (response) => {
    const request = response.request();
    if (request.method() === "POST" && request.url().includes("/api/analytics/events")) {
      let body = null;
      try { body = JSON.parse(request.postData() ?? "null"); } catch { /* ignore */ }
      let result = null;
      try { result = await response.json(); } catch { /* ignore */ }
      captured.push({ actor: label, status: response.status(), request: body, response: result });
    }
  });
  return context;
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, "screenshots", `${name}.png`), fullPage: true });
}
async function startHomeQuiz(page) {
  await page.goto(SPA, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /play a 5-question quiz/i }).click();
  await page.waitForURL(/\/quiz\/collections\//, { timeout: 15000 });
  await page.getByRole("button", { name: /^\s*A\./ }).first().waitFor({ timeout: 15000 });
}
async function finishQuiz(page) {
  for (let question = 0; question < 50; question += 1) {
    if (await page.getByText(/You answered every question/i).count()) break;
    const option = page.getByRole("button", { name: /^\s*A\./ }).first();
    await option.waitFor({ timeout: 15000 });
    await option.click();
    await page.waitForTimeout(250);
    if (await page.getByText(/You answered every question/i).count()) break;
    const next = page.getByRole("button", { name: /^next$/i });
    if (await next.count() && await next.isEnabled()) await next.click();
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: /view results/i }).click();
  await page.getByRole("heading", { name: "Quiz complete" }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200); // let the event batch flush
}
async function sessionIdOf(page) {
  return page.evaluate(() => sessionStorage.getItem("quizymode.analytics.session-id"));
}
async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

const browser = await chromium.launch();
try {
  // 1. Anonymous, both viewports: no prompt mid-quiz, prompt on the completion summary, click-through to /signup.
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const label = `anon-click-${w}`;
    const context = await newContext(browser, label, { width: w, height: h });
    const page = await context.newPage();
    await startHomeQuiz(page);
    await shot(page, `${w}-01-first-question-anonymous`);
    record(`${w}: no signup prompt on the first question`, (await page.locator(PROMPT).count()) === 0);
    await finishQuiz(page);
    const quizUrl = new URL(page.url());
    const prompt = page.locator(PROMPT);
    await prompt.scrollIntoViewIfNeeded();
    await shot(page, `${w}-02-completion-with-prompt`);
    record(`${w}: anonymous completion shows the save-progress prompt`, (await prompt.count()) === 1 && (await prompt.getAttribute("data-reason")) === "save-progress",
      { heading: await prompt.getByRole("heading").textContent(), body: await prompt.locator("p").first().textContent() });
    record(`${w}: completion page has no horizontal scroll`, await noHorizontalScroll(page));
    await prompt.getByRole("link", { name: "Create a free account" }).click();
    await page.waitForURL(/\/signup/, { timeout: 10000 });
    await page.waitForTimeout(1200);
    const signupUrl = new URL(page.url());
    const expectedReturn = `${quizUrl.pathname}${quizUrl.search}`;
    record(`${w}: click-through lands on /signup with reason and returnTo`,
      signupUrl.pathname === "/signup" && signupUrl.searchParams.get("reason") === "save-progress" && signupUrl.searchParams.get("returnTo") === expectedReturn,
      { signupUrl: `${signupUrl.pathname}${signupUrl.search}`, expectedReturn });
    await shot(page, `${w}-03-signup-from-prompt`);
    const signupHeading = (await page.getByRole("heading", { name: /make your next quiz yours|keep this result/i }).first().textContent())?.trim();
    const signupBody = (await page.getByText(/quiz scores are not saved to accounts yet/i).first().textContent().catch(() => null))?.trim() ?? null;
    const pageText = (await page.locator("main, body").first().innerText()).toLowerCase();
    record(`${w}: signup copy for reason=save-progress is neutral (no keep/saved-in-browser claim)`,
      signupHeading === "Make your next quiz yours" && Boolean(signupBody) && !pageText.includes("keep this result") && !pageText.includes("stays saved") && !pageText.includes("in this browser"),
      { signupHeading, signupBody });
    sessions[label] = await sessionIdOf(page);
    await context.close();
  }

  // 2. Anonymous: dismissal keeps the result and stays dismissed for the tab (Play again, reload).
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const label = `anon-dismiss-${w}`;
    const context = await newContext(browser, label, { width: w, height: h });
    const page = await context.newPage();
    await startHomeQuiz(page);
    await finishQuiz(page);
    const scoreBefore = await page.locator("p.text-3xl").first().textContent();
    await page.locator(PROMPT).getByRole("button", { name: "Not now" }).click();
    const scoreAfter = await page.locator("p.text-3xl").first().textContent();
    await shot(page, `${w}-04-after-dismiss`);
    record(`${w}: dismiss hides the prompt and keeps the result`, (await page.locator(PROMPT).count()) === 0 && scoreBefore === scoreAfter
      && (await page.getByRole("button", { name: "Play again" }).count()) === 1, { scoreBefore, scoreAfter });
    await page.getByRole("button", { name: "Play again" }).click();
    await finishQuiz(page);
    record(`${w}: still dismissed after Play again (next completed run)`, (await page.locator(PROMPT).count()) === 0);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const completeAfterReload = await page.getByRole("heading", { name: "Quiz complete" }).count();
    record(`${w}: still dismissed after a reload in the same tab`, (await page.locator(PROMPT).count()) === 0, { completionSummaryVisibleAfterReload: completeAfterReload === 1 });
    await shot(page, `${w}-05-after-play-again-and-reload`);
    sessions[label] = await sessionIdOf(page);
    await context.close();
  }

  // 3. Signed in (local test issuer, not Cognito): completion shows no prompt.
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const label = `signed-in-${w}`;
    const tokens = await (await fetch(`${IDP}/mint?${new URLSearchParams({ sub: `evidence-109-${w}`, email: `evidence-109-${w}@example.test` })}`)).json();
    const context = await newContext(browser, label, { width: w, height: h });
    await context.addInitScript(({ clientId, sub, idToken, accessToken }) => {
      const p = `CognitoIdentityServiceProvider.${clientId}`;
      localStorage.setItem(`${p}.LastAuthUser`, sub);
      localStorage.setItem(`${p}.${sub}.idToken`, idToken);
      localStorage.setItem(`${p}.${sub}.accessToken`, accessToken);
      localStorage.setItem(`${p}.${sub}.refreshToken`, "local-evidence-refresh");
      localStorage.setItem(`${p}.${sub}.clockDrift`, "0");
    }, { clientId: CLIENT, sub: `evidence-109-${w}`, idToken: tokens.idToken, accessToken: tokens.accessToken });
    const page = await context.newPage();
    await startHomeQuiz(page);
    const signedIn = (await page.getByRole("link", { name: /sign in/i }).count()) === 0;
    await finishQuiz(page);
    await shot(page, `${w}-06-signed-in-completion-no-prompt`);
    record(`${w}: signed-in completion shows no signup prompt`, signedIn && (await page.locator(PROMPT).count()) === 0, { headerHasNoSignInLink: signedIn });
    sessions[label] = await sessionIdOf(page);
    await context.close();
  }
} catch (error) {
  record("script error", false, { message: error.message });
} finally {
  await browser.close();
  const promptEvents = captured.flatMap((c) => (c.request?.events ?? []).filter((e) => e.name.startsWith("signup_prompt")).map((e) => ({ actor: c.actor, status: c.status, ...e })));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, sessions }, null, 2));
  fs.writeFileSync(path.join(OUT, "analytics-requests.json"), JSON.stringify(captured, null, 2));
  fs.writeFileSync(path.join(OUT, "prompt-events-sent.json"), JSON.stringify(promptEvents, null, 2));
  console.log(JSON.stringify({ sessions, promptEvents }, null, 2));
}
