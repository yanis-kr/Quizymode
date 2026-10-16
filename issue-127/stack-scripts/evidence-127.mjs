// Browser + HTTP evidence for #127 (ANALYTICS-007 study engagement events) against the local stack:
// SPA :7127 (Vite dev, proxies /api) -> API :8127 -> throwaway Postgres (qm-ev-127, :54127).
// Admin identity comes from a local test issuer :7444 (fake-oidc.cs), NOT Cognito.
// Usage: node evidence-127.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
fs.mkdirSync(path.join(OUT, "local-stack"), { recursive: true });
const SPA = "http://localhost:7127";
const API = "https://localhost:8127";
const IDP = "https://localhost:7444";
const CLIENT = "quizymode-local-evidence";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const results = [];
const requests = [];
function record(step, ok, detail) {
  const outcome = ok ? "PASS" : "FAIL";
  results.push({ step, outcome, detail });
  console.log(`[${outcome}] ${step} ${detail !== undefined ? JSON.stringify(detail) : ""}`);
}
const dbArgs = ["exec", "qm-ev-127", "psql", "-U", "postgres", "-d", "quizymode"];
const psql = (sql) => execFileSync("docker", [...dbArgs, "-P", "pager=off", "-c", sql], { encoding: "utf8" });
const rows = (sql) =>
  execFileSync("docker", [...dbArgs, "-tAF", "|", "-c", sql], { encoding: "utf8" }).trim().split("\n").filter(Boolean);

async function mint(sub, email, groups) {
  const q = new URLSearchParams({ sub, email, ...(groups ? { groups } : {}) });
  return (await fetch(`${IDP}/mint?${q}`)).json();
}
function setAmplifyTokens({ clientId, sub, idToken, accessToken }) {
  const p = `CognitoIdentityServiceProvider.${clientId}`;
  localStorage.setItem(`${p}.LastAuthUser`, sub);
  localStorage.setItem(`${p}.${sub}.idToken`, idToken);
  localStorage.setItem(`${p}.${sub}.accessToken`, accessToken);
  localStorage.setItem(`${p}.${sub}.refreshToken`, "local-evidence-refresh");
  localStorage.setItem(`${p}.${sub}.clockDrift`, "0");
}
async function newContext(browser, actor) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true, userAgent: CHROME_UA });
  context.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/analytics/events")) {
      let body = null;
      try { body = JSON.parse(request.postData() ?? "null"); } catch { body = null; }
      requests.push({
        actor,
        url: request.url().replace(SPA, "").replace(API, ""),
        keepalive: request.url().startsWith(API), // the page-hide path posts straight to the API origin
        events: (body?.events ?? []).map((e) => ({ name: e.name, runId: e.runId?.slice(0, 8), position: e.position, isCorrect: e.isCorrect, score: e.score, total: e.total })),
        internalBrowser: body?.internalBrowser ?? false,
      });
    }
  });
  return context;
}
const sent = (actor) => requests.filter((r) => r.actor === actor).flatMap((r) => r.events);
const pause = (page, ms = 600) => page.waitForTimeout(ms);

async function answerCurrent(page, optionIndex = 0) {
  const options = page.getByRole("button", { name: /^[A-D]\. / });
  await options.first().waitFor();
  await options.nth(optionIndex).click();
}
async function nextQuestion(page) {
  await page.getByRole("button", { name: /^next$/i }).click();
  await pause(page, 300);
}

const browser = await chromium.launch();
try {
  // ---- A. Anonymous visitor: complete a 10-question quiz, changing one answer -----------------
  const ctxA = await newContext(browser, "anon");
  const a = await ctxA.newPage();
  await a.goto(`${SPA}/quiz`);
  await a.getByText("1 of 10").waitFor();
  for (let q = 1; q <= 10; q++) {
    await answerCurrent(a, 0);
    if (q === 1) {
      // Try to change the first answer; the scored first answer is locked.
      await a.getByRole("button", { name: /^B\. / }).click({ force: true, timeout: 2000 }).catch(() => undefined);
    }
    if (q < 10) await nextQuestion(a);
  }
  await pause(a, 1500);
  await a.screenshot({ path: path.join(OUT, "screenshots", "01-quiz-run-complete.png"), fullPage: true });
  const runA = sent("anon");
  const runAId = runA.find((e) => e.name === "quick_quiz_started")?.runId;
  record("10-question quiz: 1 start, 10 answers, 1 completion, same runId",
    runA.filter((e) => e.name === "quick_quiz_started").length === 1 &&
    runA.filter((e) => e.name === "question_answered").length === 10 &&
    runA.filter((e) => e.name === "quiz_completed").length === 1 &&
    runA.every((e) => e.runId === runAId),
    { counts: runA.reduce((m, e) => ((m[e.name] = (m[e.name] ?? 0) + 1), m), {}), requests: requests.filter((r) => r.actor === "anon").length });
  record("Changing an answer sends no second question_answered for position 1",
    runA.filter((e) => e.name === "question_answered" && e.position === 1).length === 1);

  // ---- B. Play again in the same tab, answer 4, then close the tab ----------------------------
  await a.getByRole("button", { name: /view results/i }).click();
  await a.getByRole("button", { name: /play again/i }).click();
  await a.getByText("1 of 10").waitFor();
  for (let q = 1; q <= 4; q++) {
    await answerCurrent(a, 1);
    if (q < 4) await nextQuestion(a);
  }
  await pause(a, 800);
  const beforeClose = sent("anon").length;
  await a.screenshot({ path: path.join(OUT, "screenshots", "02-replay-four-answers-before-close.png"), fullPage: true });
  await a.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 2000));
  const replay = sent("anon").slice(runA.length);
  const replayId = replay.find((e) => e.name === "quick_quiz_started")?.runId;
  record("Play again starts a new runId", !!replayId && replayId !== runAId, { first: runAId, replay: replayId });
  // The page-hide keepalive fetch may outlive Playwright's request tracking, so the proof is the stored rows.
  const replayRows = rows(`select "Position" from "AnalyticsEvents" where "EventName"='question_answered' and left("RunId",8)='${replayId}' order by "Position"`);
  record("Closing the tab after 4 answers delivers those 4 answers (stored rows for the replay run)",
    replayRows.join(",") === "1,2,3,4",
    { sentByRegularBatchesBeforeClose: sent("anon").slice(runA.length).filter((e) => e.name === "question_answered").length, storedPositions: replayRows });
  await ctxA.close();

  // ---- C. Internal (marked) browser: start a quiz, answer 2 -----------------------------------
  const ctxC = await newContext(browser, "internal");
  await ctxC.addInitScript(() => localStorage.setItem("quizymode.analytics.internal-browser", "true"));
  const c = await ctxC.newPage();
  await c.goto(`${SPA}/quiz`);
  await c.getByText("1 of 10").waitFor();
  await answerCurrent(c, 0); await nextQuestion(c); await answerCurrent(c, 0);
  await c.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 1500));
  record("Internal browser sends internalBrowser: true", requests.filter((r) => r.actor === "internal").every((r) => r.internalBrowser));
  await ctxC.close();

  // ---- D. HTTP validation -------------------------------------------------------------------
  const post = async (events) => {
    const r = await fetch(`${API}/analytics/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "evidence-127-http", events }) });
    return { status: r.status, body: (await r.text()).slice(0, 400) };
  };
  const rowCountBefore = rows(`select count(*) from "AnalyticsEvents"`)[0];
  const item = "00000000-0000-4000-8000-000000000001";
  const checks = {
    unknownName: await post([{ name: "quiz_paused", path: "/quiz", runId: "r1" }]),
    positionZero: await post([{ name: "question_answered", path: "/quiz", runId: "r1", itemId: item, position: 0, isCorrect: true }]),
    position501: await post([{ name: "question_answered", path: "/quiz", runId: "r1", itemId: item, position: 501, isCorrect: true }]),
    scoreOverTotal: await post([{ name: "quiz_completed", path: "/quiz", runId: "r1", score: 11, total: 10 }]),
    total501: await post([{ name: "quiz_completed", path: "/quiz", runId: "r1", score: 1, total: 501 }]),
  };
  const rowCountAfter = rows(`select count(*) from "AnalyticsEvents"`)[0];
  fs.writeFileSync(path.join(OUT, "local-stack", "http-validation.json"), JSON.stringify(checks, null, 2));
  record("Unknown names and out-of-range values return 400 and store nothing",
    Object.values(checks).every((x) => x.status === 400) && rowCountBefore === rowCountAfter,
    { statuses: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.status])), rowCountBefore, rowCountAfter });

  // ---- E. Admin Learning report (test issuer admin) -------------------------------------------
  const admin = await mint("admin-local-127", "admin127@local.test", "Admins");
  const getJson = async (qs) => (await fetch(`${API}/admin/analytics/learning${qs}`, { headers: { Authorization: `Bearer ${admin.idToken}` } })).json();
  const learningDefault = await getJson("?days=7");
  const learningInternal = await getJson("?days=7&includeInternal=true");
  fs.writeFileSync(path.join(OUT, "local-stack", "admin-learning-default.json"), JSON.stringify(learningDefault, null, 2));
  fs.writeFileSync(path.join(OUT, "local-stack", "admin-learning-include-internal.json"), JSON.stringify(learningInternal, null, 2));
  const quizScope = (rep) => rep.scopes.find((s) => s.mode === "quiz");
  const qd = quizScope(learningDefault);
  record("Learning report (default): 2 quiz runs started, 1 completed, 50% completion",
    qd?.runsStarted === 2 && qd?.runsCompleted === 1 && qd?.completionRatePercent === 50, qd);
  const p4 = learningDefault.quizDropOff.find((d) => d.position === 4);
  const p5 = learningDefault.quizDropOff.find((d) => d.position === 5);
  record("Abandoned replay counts as stopped at position 4", p4?.runsAbandonedHere === 1 && p5?.runsReached === 1, { p4, p5 });
  const qi = quizScope(learningInternal);
  record("Internal session excluded by default and included with includeInternal=true",
    learningDefault.internalSessions >= 1 && qi?.runsStarted === 3,
    { internalSessions: learningDefault.internalSessions, internalExcluded: learningDefault.internalExcluded, runsStartedWithInternal: qi?.runsStarted });

  const ctxE = await newContext(browser, "admin");
  await ctxE.addInitScript(setAmplifyTokens, { clientId: CLIENT, sub: "admin-local-127", idToken: admin.idToken, accessToken: admin.accessToken });
  const e = await ctxE.newPage();
  await e.goto(`${SPA}/admin/page-views`);
  await e.getByRole("button", { name: /Learning/ }).click();
  await e.getByText(/drop-off/i).first().waitFor({ timeout: 15000 });
  await pause(e, 1500);
  await e.screenshot({ path: path.join(OUT, "screenshots", "03-admin-learning-tab.png"), fullPage: true });
  await ctxE.close();

  // ---- F. Stored rows ------------------------------------------------------------------------
  const dbText = psql(`select left("SessionId",8) as session, "EventName", left("RunId",8) as run, "Position", "IsCorrect", "Score", "Total", "IsInternal", "IsBot", "ContextType" from "AnalyticsEvents" order by "OccurredUtc", "Position" nulls first`);
  fs.writeFileSync(path.join(OUT, "local-stack", "db-analytics-events.txt"), dbText);
  fs.writeFileSync(path.join(OUT, "local-stack", "analytics-requests.json"), JSON.stringify(requests, null, 2));
  const shot = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await shot.setContent(`<pre style="font:11px Consolas,monospace;padding:12px">${dbText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`);
  await shot.screenshot({ path: path.join(OUT, "screenshots", "04-db-rows.png"), fullPage: true });
} finally {
  fs.writeFileSync(path.join(OUT, "local-stack", "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
