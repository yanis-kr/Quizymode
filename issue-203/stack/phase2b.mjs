// #199 shared cache + ownership + premium tier.
import fs from "fs";
import { chromium, newContext, USERS, SPA, EV, record, saveResults, http, uploadFile, psql, scalar, shot, sleep } from "./lib.mjs";

const state = JSON.parse(fs.readFileSync(`${EV}/logs/state.json`, "utf8"));
const browser = await chromium.launch();
try {
  // ---- ownership ----
  const bobSeesAlice = await http("GET", `/study-guides/documents/${state.pdfDocId}`, { who: USERS.bob });
  const anonSees = await http("GET", `/study-guides/documents/${state.pdfDocId}`);
  const bobGen = await http("POST", `/study-guides/documents/${state.pdfDocId}/generate`, { who: USERS.bob, json: { sectionIds: ["00000000-0000-0000-0000-000000000001"] } });
  record("#199", "ownership: member B GET member A's document -> 404", bobSeesAlice.status === 404, { status: bobSeesAlice.status, bearer: true });
  record("#199", "ownership: anonymous GET -> 401; member B generate on A's document -> 404", anonSees.status === 401 && bobGen.status === 404, { anonymous: anonSees.status, bobGenerate: bobGen.status });

  // ---- bob uploads the same PDF (own document, cache by text hash) ----
  const up = await uploadFile(USERS.bob, `${EV}/files/science-guide-14p.pdf`);
  state.bobDocId = up.body.id;
  record("#199", "member B uploading the same PDF gets his OWN document (201, different id, not a duplicate)", up.status === 201 && up.body.id !== state.pdfDocId && up.body.isDuplicate === false, { status: up.status, sameIdAsAlice: up.body.id === state.pdfDocId, isDuplicate: up.body.isDuplicate, sections: up.body.sections?.length });

  const bobCtx = (await newContext(browser, USERS.bob)).context;
  const bob = await bobCtx.newPage();
  await bob.goto(`${SPA}/study-guides/documents/${state.bobDocId}`, { waitUntil: "networkidle" });
  await bob.waitForTimeout(1500);
  await shot(bob, "11-bob-picker-before", { fullPage: true });
  const beforeText = await bob.locator("body").innerText();
  fs.writeFileSync(`${EV}/logs/199-bob-before.txt`, beforeText);
  const bobStatusesBefore = (await http("GET", `/study-guides/documents/${state.bobDocId}`, { who: USERS.bob })).body.sections.map((s) => ({ label: s.label, status: s.status, cached: s.cached }));

  // keep first 3 (cached ones) selected, generate
  for (const name of ["pp. 7–8", "pp. 9–10", "pp. 11–12", "pp. 13–14"]) {
    const box = bob.getByRole("checkbox", { name: new RegExp(name) });
    if (await box.isChecked()) await box.uncheck();
  }
  const llmLogLinesBefore = fs.readFileSync(`${EV}/logs/fake-llm.log`, "utf8").trim().split("\n").length;
  await bob.getByRole("button", { name: /Generate 3 sections/ }).click();
  await bob.waitForTimeout(3000);
  await shot(bob, "12-bob-cached-ready-free", { fullPage: true });
  const afterText = await bob.locator("body").innerText();
  fs.writeFileSync(`${EV}/logs/199-bob-after-cached-generate.txt`, afterText);
  const bobDoc = (await http("GET", `/study-guides/documents/${state.bobDocId}`, { who: USERS.bob })).body;
  const bobStatuses = bobDoc.sections.map((s) => ({ label: s.label, status: s.status, cached: s.cached, droppedCount: s.droppedCount, candidates: s.candidates?.length ?? 0 }));
  const bobCharges = scalar(`select count(*) from "StudyGuideQuotaCharges" where "UserId"='${state.bobUserId}'`);
  const aliceCharges = scalar(`select count(*) from "StudyGuideQuotaCharges" where "UserId"='${state.aliceUserId}'`);
  const vendorCallsDuring = fs.readFileSync(`${EV}/logs/fake-llm.log`, "utf8").trim().split("\n").length - llmLogLinesBefore;
  const readyFree = (afterText.match(/Ready, free/g) ?? []).length;
  const genMsg = afterText.match(/[^\n]*(ready for free|Queued|queued)[^\n]*/)?.[0];
  record("#199", "cache: B's first 3 sections show 'Ready, free' immediately and generating them charges 0", readyFree >= 3 && bobCharges === "0" && bobStatuses.slice(0, 3).every((s) => s.status === "Generated" && s.cached === true), { readyFreeChips: readyFree, bobChargeRows: bobCharges, aliceChargeRows: aliceCharges, vendorCallsMade: vendorCallsDuring, message: genMsg, bobStatuses: bobStatuses.slice(0, 4) });
  fs.writeFileSync(`${EV}/logs/199-cache-bob.json`, JSON.stringify({ bobStatusesBeforeGenerate: bobStatusesBefore, bobStatusesAfter: bobStatuses, bobChargeRows: bobCharges, aliceChargeRows: aliceCharges, fakeVendorCallsDuringBobGenerate: vendorCallsDuring, uiMessage: genMsg }, null, 2));
  const chargeTable = psql(`select u."Email", count(c.*) as charge_rows, coalesce(sum(c."Cost"),0) as cost_sum from "Users" u left join "StudyGuideQuotaCharges" c on c."UserId"=u."Id"::text where u."Subject" in ('alice-203','bob-203') group by u."Email" order by 1`);
  fs.writeFileSync(`${EV}/logs/199-charge-rows-alice-vs-bob.txt`, chargeTable);

  // ---- premium: admin UI sets StudyGuidePremium for bob ----
  const adminCtx = (await newContext(browser, USERS.admin)).context;
  const admin = await adminCtx.newPage();
  await admin.goto(`${SPA}/admin/user-settings`, { waitUntil: "networkidle" });
  await admin.fill("#userSearch", "bob203@example.com");
  await admin.getByRole("button", { name: "Apply" }).first().click();
  await admin.waitForTimeout(1500);
  await admin.getByText("bob203@example.com").first().click();
  await admin.waitForTimeout(1500);
  const premiumBox = admin.getByLabel("Premium", { exact: true });
  await premiumBox.scrollIntoViewIfNeeded();
  await premiumBox.check();
  await admin.getByRole("button", { name: "Save plan" }).click();
  await admin.getByText("Study guide plan saved.").waitFor({ timeout: 10000 });
  await shot(admin, "13-admin-sets-bob-premium");
  const premiumSetting = scalar(`select "Value" from "UserSettings" where "UserId"='${state.bobUserId}' and "Key"='StudyGuidePremium'`);
  record("#199", "admin UI sets StudyGuidePremium=true for member B", premiumSetting === "true", { dbValue: premiumSetting });

  await bob.goto(`${SPA}/study-guides/documents/${state.bobDocId}`, { waitUntil: "networkidle" });
  await bob.waitForTimeout(1500);
  const premiumCounter = (await bob.locator("body").innerText()).match(/\d+ of \d+ this month · \w+ plan/)?.[0];
  for (const name of ["pp. 11–12", "pp. 13–14"]) {
    const box = bob.getByRole("checkbox", { name: new RegExp(name) });
    if (await box.isChecked()) await box.uncheck();
  }
  const t0 = new Date();
  await bob.getByRole("button", { name: /Generate 2 sections/ }).click();
  await bob.waitForTimeout(2000);
  await shot(bob, "14-bob-premium-generating-no-delay", { fullPage: true });
  const premText = await bob.locator("body").innerText();
  const noDelayNotice = !/Free plan: generation starts within/.test(premText);
  const prem = psql(`select g."Tier", g."Status", g."QueuedUtc", g."NotBeforeUtc", (g."NotBeforeUtc"-g."QueuedUtc") as delay, g."CompletedUtc", (g."CompletedUtc"-g."QueuedUtc") as queued_to_done from "SectionGenerations" g where g."Tier"=1 order by g."QueuedUtc"`);
  let done = 0;
  const t1 = Date.now();
  while (Date.now() - t1 < 90000) {
    done = Number(scalar(`select count(*) from "SectionGenerations" where "Tier"=1 and "Status"=2`));
    if (done >= 2) break;
    await sleep(1500);
  }
  const secs = ((Date.now() - t0.getTime()) / 1000).toFixed(1);
  const premAfter = psql(`select g."Tier", g."Status", g."Vendor", g."Model", g."QueuedUtc", g."NotBeforeUtc", (g."NotBeforeUtc"-g."QueuedUtc") as delay, g."CompletedUtc", (g."CompletedUtc"-g."QueuedUtc") as queued_to_done from "SectionGenerations" g where g."Tier"=1 order by g."QueuedUtc"`);
  fs.writeFileSync(`${EV}/logs/199-premium-generations.txt`, `-- right after click\n${prem}\n-- after completion\n${premAfter}\nPremium counter before: ${premiumCounter}\n`);
  const maxDelay = Number(scalar(`select coalesce(max(extract(epoch from ("NotBeforeUtc"-"QueuedUtc"))),-1) from "SectionGenerations" where "Tier"=1`));
  const bobChargesNow = scalar(`select count(*) from "StudyGuideQuotaCharges" where "UserId"='${state.bobUserId}'`);
  await bob.waitForTimeout(4000);
  await shot(bob, "15-bob-premium-done", { fullPage: true });
  record("#199", "premium: B's new jobs are Tier=Premium, due immediately (NotBefore = Queued) and complete within seconds, no free-plan delay notice", done >= 2 && maxDelay === 0 && noDelayNotice, { secondsFromClickToDone: secs, notBeforeMinusQueuedSeconds: maxDelay, delayNoticeAbsent: noDelayNotice, bobChargeRows: bobChargesNow, premiumCounter });
  fs.writeFileSync(`${EV}/logs/state.json`, JSON.stringify(state, null, 2));
} catch (e) {
  record("phase2b", "script error", false, String(e).slice(0, 500));
} finally {
  saveResults("phase2b");
  await browser.close();
}
