// #202 admin providers + #199 free-tier generation (delay, completion, quota 429). Run after phase1.
import fs from "fs";
import { chromium, newContext, USERS, SPA, API, EV, record, saveResults, http, psql, scalar, shot, htmlShot, sleep } from "./lib.mjs";

const ids = JSON.parse(fs.readFileSync(`${EV}/logs/198-ids.json`, "utf8"));
const browser = await chromium.launch();
const state = { ...ids };
try {
  // make sure every actor has a Users row (created on first authenticated call)
  for (const u of [USERS.alice, USERS.bob, USERS.admin]) await http("GET", "/study-guides/documents/config", { who: u });
  const userId = (sub) => scalar(`select "Id" from "Users" where "Subject"='${sub}'`);
  state.aliceUserId = userId(USERS.alice.sub);
  state.bobUserId = userId(USERS.bob.sub);

  // ---- #202 auth gates ----
  const anon = await http("GET", "/admin/llm-providers");
  const member = await http("GET", "/admin/llm-providers", { who: USERS.alice });
  const memberAttempts = await http("GET", "/admin/llm-providers/attempts", { who: USERS.alice });
  record("#202", "anonymous GET /admin/llm-providers -> 401", anon.status === 401, { status: anon.status });
  record("#202", "member GET /admin/llm-providers -> 403 (and /attempts -> 403)", member.status === 403 && memberAttempts.status === 403, { status: member.status, attemptsStatus: memberAttempts.status, bearer: true });
  const memberPut = await http("PUT", "/admin/llm-providers", { who: USERS.alice, json: { vendors: [], routes: { free: ["DeepSeek"], premium: ["DeepSeek"] } } });
  record("#202", "member PUT /admin/llm-providers -> 403", memberPut.status === 403, { status: memberPut.status });

  // ---- #202 admin UI ----
  const adminCtx = (await newContext(browser, USERS.admin)).context;
  const admin = await adminCtx.newPage();
  await admin.goto(`${SPA}/admin/ai-providers`, { waitUntil: "networkidle" });
  await admin.waitForTimeout(1500);
  await shot(admin, "05-admin-ai-providers-default", { fullPage: true });
  const adminText = await admin.locator("body").innerText();
  record("#202", "admin page shows key badges (DeepSeek, OpenAI configured; Gemini no key)", /Key configured/.test(adminText) && /No key/.test(adminText), { keyConfiguredBadges: (adminText.match(/Key configured/g) ?? []).length, noKeyBadges: (adminText.match(/No key/g) ?? []).length });
  const before = await http("GET", "/admin/llm-providers", { who: USERS.admin });
  fs.writeFileSync(`${EV}/logs/202-llm-providers-before.json`, JSON.stringify(before, null, 2));
  record("#202", "GET /admin/llm-providers returns seeded defaults (free Gemini,OpenAI,DeepSeek; premium DeepSeek,OpenAI,Gemini)", JSON.stringify(before.body.routes.free) === JSON.stringify(["Gemini", "OpenAI", "DeepSeek"]) && JSON.stringify(before.body.routes.premium) === JSON.stringify(["DeepSeek", "OpenAI", "Gemini"]), { routes: before.body.routes, vendors: before.body.vendors });
  // free route -> [OpenAI, DeepSeek] by removing Gemini in the route editor
  await admin.getByRole("button", { name: /Remove Gemini from Free route/i }).click();
  await admin.getByRole("button", { name: "Save settings" }).click();
  await admin.getByText("AI provider settings saved.").waitFor({ timeout: 10000 });
  await shot(admin, "06-admin-ai-providers-free-route-saved", { fullPage: true });
  const after = await http("GET", "/admin/llm-providers", { who: USERS.admin });
  fs.writeFileSync(`${EV}/logs/202-llm-providers-after.json`, JSON.stringify(after, null, 2));
  record("#202", "free route saved as [OpenAI, DeepSeek] through the admin UI", JSON.stringify(after.body.routes.free) === JSON.stringify(["OpenAI", "DeepSeek"]), { routes: after.body.routes });

  // ---- #199 alice (free member): picker, counter, generate 3 sections ----
  const aliceCtx = (await newContext(browser, USERS.alice)).context;
  const alice = await aliceCtx.newPage();
  await alice.goto(`${SPA}/study-guides/documents/${ids.pdfDocId}`, { waitUntil: "networkidle" });
  await alice.waitForTimeout(1500);
  const boxes = alice.getByRole("checkbox");
  const checkedBefore = await boxes.evaluateAll((els) => els.filter((e) => e.checked).length);
  const counterBefore = (await alice.locator("body").innerText()).match(/\d+ of \d+ sections today/)?.[0];
  record("#199", "picker preselects the first New sections up to remaining quota (7 checked) and counter reads '7 of 10 sections today'", checkedBefore === 7 && counterBefore === "7 of 10 sections today", { checked: checkedBefore, counter: counterBefore });
  await shot(alice, "07-alice-picker-preselected");
  // keep only the first three sections selected
  for (const name of ["pp. 7–8", "pp. 9–10", "pp. 11–12", "pp. 13–14"]) await alice.getByRole("checkbox", { name: new RegExp(name) }).uncheck();
  await alice.waitForTimeout(500);
  const counter3 = (await alice.locator("body").innerText()).match(/\d+ of \d+ sections today/)?.[0];
  await alice.getByRole("button", { name: /Generate 3 sections/ }).click();
  state.aliceGenClickedUtc = new Date().toISOString();
  await alice.waitForTimeout(2500);
  const queuedText = await alice.locator("body").innerText();
  await shot(alice, "08-alice-queued-with-delay-notice", { fullPage: true });
  record("#199", "after Generate the sections show Queued and the free-plan delay notice", /Queued/.test(queuedText) && /Free plan: generation starts within about/.test(queuedText), { notice: queuedText.match(/Free plan: generation starts within about[^\n]*/)?.[0], counterWith3Selected: counter3, queuedChips: (queuedText.match(/Queued/g) ?? []).length });
  const queuedRows = psql(`select g."Id", g."Status", g."Tier", g."QueuedUtc", g."NotBeforeUtc", (g."NotBeforeUtc"-g."QueuedUtc") as delay from "SectionGenerations" g order by g."QueuedUtc"`);
  fs.writeFileSync(`${EV}/logs/199-queued-generations.txt`, queuedRows);
  const delaySecs = Number(scalar(`select round(extract(epoch from max("NotBeforeUtc"-"QueuedUtc"))) from "SectionGenerations"`));
  record("#199", "DB: queued free-tier generations are due 60 s after queueing (config FreeTierDelayMinutes=1)", delaySecs === 60, { delaySeconds: delaySecs });
  // premium-before? not yet. wait for completion
  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < 240000) {
    await sleep(5000);
    const n = scalar(`select count(*) from "SectionGenerations" where "Status"=2`); // Completed
    if (Number(n) >= 3) { done = true; break; }
  }
  const secsToDone = Math.round((Date.now() - t0) / 1000);
  record("#199", "worker completed the 3 free-tier generations after the delay", done, { secondsAfterUiConfirmation: secsToDone });
  await alice.waitForTimeout(4500); // let the UI poll (3 s) pick it up
  await shot(alice, "09-alice-generated-review", { fullPage: true });
  const doneText = await alice.locator("body").innerText();
  fs.writeFileSync(`${EV}/logs/199-alice-document-after-generation.txt`, doneText);
  record("#199", "UI shows the sections Done / questions to review after completion", /Done|Save \d+ selected|Include question/.test(doneText), { has: { done: /Done/.test(doneText), review: /Include question/.test(doneText) } });
  const gens = psql(`select g."Status", g."Tier", g."Vendor", g."Model", g."DroppedCount", g."InputTokens", g."OutputTokens", g."QueuedUtc", g."NotBeforeUtc", g."CompletedUtc" from "SectionGenerations" g order by g."QueuedUtc"`);
  fs.writeFileSync(`${EV}/logs/199-generations.txt`, gens);

  // ---- #199 quota: counter matches DB, then 429 over remaining ----
  const aliceCharges = scalar(`select coalesce(sum("Cost"),0) from "StudyGuideQuotaCharges" where "UserId"='${state.aliceUserId}'`);
  const cfg = await http("GET", "/study-guides/documents/config", { who: USERS.alice });
  record("#199", "quota counter matches DB charges (3 sections charged to alice)", Number(aliceCharges) === 3 && cfg.body.quota.dailyUsed === 3 && cfg.body.quota.remainingToday === 7, { dbChargedSum: aliceCharges, quota: cfg.body.quota });
  // tighten alice's daily limit to 4 via the admin setting (AC 5.1.3b), so 1 section remains
  const setLimit = await http("PUT", `/admin/users/${state.aliceUserId}/settings`, { who: USERS.admin, json: { key: "StudyGuideDailySections", value: "4" } });
  const doc = await http("GET", `/study-guides/documents/${ids.pdfDocId}`, { who: USERS.alice });
  const newIds = doc.body.sections.filter((s) => s.status === "New").map((s) => s.id);
  const over = await http("POST", `/study-guides/documents/${ids.pdfDocId}/generate`, { who: USERS.alice, json: { sectionIds: newIds.slice(0, 2) } });
  const chargesAfter429 = scalar(`select coalesce(sum("Cost"),0) from "StudyGuideQuotaCharges" where "UserId"='${state.aliceUserId}'`);
  fs.writeFileSync(`${EV}/logs/199-quota-429.json`, JSON.stringify({ adminSetDailyOverride: { status: setLimit.status, value: 4 }, quotaBefore: (await http("GET", "/study-guides/documents/config", { who: USERS.alice })).body.quota, requestedSections: 2, response: { status: over.status, body: over.body }, dbChargedSumAfter: chargesAfter429 }, null, 2));
  record("#199", "requesting 2 sections with 1 left (daily override 4, used 3) -> 429 QuotaExceeded, nothing charged", over.status === 429 && /QuotaExceeded/.test(JSON.stringify(over.body)) && chargesAfter429 === "3", { setOverrideStatus: setLimit.status, status: over.status, title: over.body?.title, detail: over.body?.detail, dbChargedSumAfter: chargesAfter429 });
  await alice.goto(`${SPA}/study-guides/documents/${ids.pdfDocId}`, { waitUntil: "networkidle" });
  await alice.waitForTimeout(1500);
  await shot(alice, "10-alice-counter-with-override", { fullPage: true });
  const counterOverride = (await alice.locator("body").innerText()).match(/\d+ of \d+ sections today/)?.[0];
  state.counterWithOverride = counterOverride;
  const ok1 = await http("POST", `/study-guides/documents/${ids.pdfDocId}/generate`, { who: USERS.alice, json: { sectionIds: [] } });
  // restore the default limit
  const clear = await http("PUT", `/admin/users/${state.aliceUserId}/settings`, { who: USERS.admin, json: { key: "StudyGuideDailySections", value: "" } });
  record("#199", "daily override cleared again (200)", clear.status === 200, { status: clear.status, emptySectionIdsStatus: ok1.status });
  const chargeRows = psql(`select c."UserId", c."SectionId", c."Cost", c."ChargedUtc" from "StudyGuideQuotaCharges" c order by c."ChargedUtc"`);
  fs.writeFileSync(`${EV}/logs/199-charges-after-alice.txt`, chargeRows);
  fs.writeFileSync(`${EV}/logs/state.json`, JSON.stringify(state, null, 2));
} catch (e) {
  record("phase2a", "script error", false, String(e).slice(0, 500));
} finally {
  saveResults("phase2a");
  await browser.close();
}
