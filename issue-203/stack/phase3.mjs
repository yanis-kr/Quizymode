// #202 vendor fallback + attempts log + dropped quotes/candidates verbatim in DB, and the review UI.
import fs from "fs";
import { chromium, newContext, USERS, SPA, EV, record, saveResults, http, psql, scalar, shot, htmlShot, sleep } from "./lib.mjs";

const state = JSON.parse(fs.readFileSync(`${EV}/logs/state.json`, "utf8"));
const browser = await chromium.launch();
const control = (failPrefix) => fetch("http://127.0.0.1:7555/control", { method: "POST", body: JSON.stringify({ failPrefix }) }).then((r) => r.json());
try {
  // ---- fallback: OpenAI (first in the free route) fails with HTTP 500, DeepSeek answers ----
  const alreadyDone = Number(scalar(`select count(*) from "SectionGenerations" g join "StudyGuideSections" s on s."GenerationId"=g."Id" where s."DocumentId"='${state.docxDocId}' and g."Status"=2`)) >= 3;
  if (!alreadyDone) await control("oai");
  const aliceCtx = (await newContext(browser, USERS.alice)).context;
  const alice = await aliceCtx.newPage();
  await alice.goto(`${SPA}/study-guides/documents/${state.docxDocId}`, { waitUntil: "networkidle" });
  await alice.waitForTimeout(1500);
  const attemptsBefore = Number(scalar(`select count(*) from "LlmAttempts"`));
  if (!alreadyDone) {
  await alice.getByRole("button", { name: /Generate 3 sections/ }).click();
  await alice.waitForTimeout(2000);
  await shot(alice, "16-alice-docx-queued", { fullPage: true });
  }
  const t0 = Date.now();
  while (!alreadyDone && Date.now() - t0 < 240000) {
    await sleep(5000);
    const done = Number(scalar(`select count(*) from "SectionGenerations" g join "StudyGuideSections" s on s."GenerationId"=g."Id" where s."DocumentId"='${state.docxDocId}' and g."Status"=2`));
    if (done >= 3) break;
  }
  await control(null);
  await alice.waitForTimeout(4500);
  await shot(alice, "17-alice-docx-generated", { fullPage: true });
  const attempts = psql(`select to_char(a."CreatedUtc",'HH24:MI:SS') as time, a."Vendor", a."Model", case a."Outcome" when 0 then 'Success' when 1 then 'ProviderError' when 2 then 'Timeout' when 3 then 'ContentFilter' when 4 then 'LowQuoteYield' else 'InvalidJson' end as outcome, a."InputTokens", a."OutputTokens", a."DurationMs", left(a."GenerationId"::text,8) as generation from "LlmAttempts" a order by a."CreatedUtc", a."Vendor"`);
  fs.writeFileSync(`${EV}/logs/202-llm-attempts-db.txt`, attempts);
  const docxAttempts = scalar(`select string_agg(distinct a."Vendor"||':'||a."Outcome", ',' order by a."Vendor"||':'||a."Outcome") from "LlmAttempts" a join "StudyGuideSections" s on s."GenerationId"=a."GenerationId" where s."DocumentId"='${state.docxDocId}'`);
  const perGen = scalar(`select bool_and(x.ok) from (select a."GenerationId", (array_agg(a."Vendor"::text order by a."CreatedUtc"))[1:2] = array['OpenAI','DeepSeek'] and (array_agg(a."Outcome" order by a."CreatedUtc"))[1:2] = array[1,0] as ok from "LlmAttempts" a join "StudyGuideSections" s on s."GenerationId"=a."GenerationId" where s."DocumentId"='${state.docxDocId}' group by a."GenerationId") x`);
  const docxDone = scalar(`select count(*) from "SectionGenerations" g join "StudyGuideSections" s on s."GenerationId"=g."Id" where s."DocumentId"='${state.docxDocId}' and g."Status"=2`);
  const vendorOfDocx = scalar(`select string_agg(distinct g."Vendor", ',') from "SectionGenerations" g join "StudyGuideSections" s on s."GenerationId"=g."Id" where s."DocumentId"='${state.docxDocId}'`);
  record("#202", "fallback: each DOCX generation logged OpenAI ProviderError (HTTP 500) then DeepSeek Success; all 3 completed with DeepSeek", docxDone === "3" && perGen === "t" && vendorOfDocx === "DeepSeek", { generationsCompleted: docxDone, attemptPairsOk: perGen, completedBy: vendorOfDocx, attemptsSeen: docxAttempts });
  const llmLog = fs.readFileSync(`${EV}/logs/fake-llm.log`, "utf8");
  const fails = llmLog.split("\n").filter((l) => l.includes('"status":500')).length;
  record("#202", "fake vendor log shows the forced HTTP 500 on the OpenAI path and 200 on the DeepSeek path for the same sections", fails >= 3 && /\/ds\/chat\/completions.*"model":"deepseek-flash"/.test(llmLog), { http500OnOaiPath: fails });

  // ---- admin attempts: HTTP + UI ----
  const att = await http("GET", "/admin/llm-providers/attempts?days=7", { who: USERS.admin });
  fs.writeFileSync(`${EV}/logs/202-attempts-api.json`, JSON.stringify(att.body, null, 2));
  const outcomes = {};
  for (const a of att.body.attempts) outcomes[`${a.vendor}:${a.outcome}`] = (outcomes[`${a.vendor}:${a.outcome}`] ?? 0) + 1;
  record("#202", "GET /admin/llm-providers/attempts lists OpenAI Success, OpenAI ProviderError, DeepSeek Success (newest first)", outcomes["OpenAI:Success"] >= 3 && outcomes["OpenAI:ProviderError"] >= 3 && outcomes["DeepSeek:Success"] >= 5, { outcomes, count: att.body.attempts.length });
  const adminCtx = (await newContext(browser, USERS.admin)).context;
  const admin = await adminCtx.newPage();
  await admin.goto(`${SPA}/admin/ai-providers`, { waitUntil: "networkidle" });
  await admin.waitForTimeout(1500);
  await admin.getByText("Recent attempts").scrollIntoViewIfNeeded();
  await shot(admin, "18-admin-ai-providers-recent-attempts", { fullPage: true });
  const adminText = await admin.locator("body").innerText();
  record("#202", "admin page Recent attempts table shows ProviderError and Success rows and the monthly budget bar", /ProviderError/.test(adminText) && /Success/.test(adminText) && /sections generated this month/.test(adminText), { budgetLine: adminText.match(/[^\n]*sections generated this month[^\n]*/)?.[0] });

  // ---- DB: dropped counts, verbatim quotes ----
  const gens = psql(`select left(g."Id"::text,8) as gen, case g."Status" when 2 then 'Completed' when 3 then 'Failed' else g."Status"::text end as status, g."Tier", g."Vendor", g."Model", g."DroppedCount" as dropped, (select count(*) from "GenerationCandidates" c where c."GenerationId"=g."Id") as candidates, g."InputTokens" as in_tok, g."OutputTokens" as out_tok, (g."SourceText" is null) as source_text_cleared from "SectionGenerations" g order by g."QueuedUtc"`);
  const nonVerbatim = scalar(`select count(*) from "GenerationCandidates" c join "StudyGuideSections" s on s."GenerationId"=c."GenerationId" where position(lower(c."SourceQuote") in lower(regexp_replace(s."Text", E'\\\\s+', ' ', 'g')))=0`);
  const totalCand = scalar(`select count(*) from "GenerationCandidates"`);
  const inventedStored = scalar(`select count(*) from "GenerationCandidates" where "SourceQuote" like '%invented by the fake vendor%'`);
  const okLines = llmLog.split("\n").filter((l) => l.includes('"status":200'));
  const returnedSum = okLines.reduce((n, l) => n + JSON.parse(l).questionsReturned, 0);
  const expectedKept = returnedSum - okLines.length; // each reply carries exactly 1 invented-quote question
  const dropSum = scalar(`select count(*) from "SectionGenerations" where "DroppedCount"=1`);
  const gensTotal = scalar(`select count(*) from "SectionGenerations" where "Status"=2`);
  const sample = psql(`select c."Index", c."Page", left(c."SourceQuote",110) as source_quote, left(c."CorrectAnswer",50) as correct from "GenerationCandidates" c join "SectionGenerations" g on g."Id"=c."GenerationId" order by g."QueuedUtc", c."Index" limit 8`);
  record("#202", "DB: every completed generation dropped exactly 1 question (the invented quote) and kept all the rest (fake vendor replies: 5 questions normally, 4 for a short section; kept = returned - 1)", dropSum === gensTotal && totalCand === String(expectedKept) && inventedStored === "0", { completedGenerations: gensTotal, generationsWithDropped1: dropSum, candidatesStored: totalCand, expectedKeptFromVendorLog: expectedKept, vendorReplies: okLines.length, inventedQuoteCandidatesStored: inventedStored });
  record("#202", "DB: every stored candidate's sourceQuote occurs verbatim in its section text (whitespace-collapsed, case-insensitive position() check)", nonVerbatim === "0", { candidatesChecked: totalCand, notFoundInSectionText: nonVerbatim });
  const dbText = `-- SectionGenerations (shared cache rows)\n${gens}\n-- sample candidates (page + verbatim sourceQuote)\n${sample}\n-- checks\ncandidates stored: ${totalCand}\ncandidates whose sourceQuote is NOT found in the section text: ${nonVerbatim}\ncandidates carrying the invented quote: ${inventedStored}\ngenerations with DroppedCount=1: ${dropSum} of ${gensTotal} completed\n\n-- LlmAttempts\n${attempts}`;
  fs.writeFileSync(`${EV}/logs/202-db-generations-candidates.txt`, dbText);
  await htmlShot(browser, "19-db-dropped-and-verbatim-quotes", "#202 DB: generations, dropped counts, candidates with verbatim quotes, LLM attempts", dbText);

  // ---- review UI: quote + page + dropped note ----
  await alice.goto(`${SPA}/study-guides/documents/${state.pdfDocId}`, { waitUntil: "networkidle" });
  await alice.waitForTimeout(1500);
  const txt = await alice.locator("body").innerText();
  record("#202", "review UI shows 'From your guide, p. N: “quote”' and '1 question dropped: not found in your guide'", /From your guide, p\. \d+: “/.test(txt) && /1 question dropped: not found in your guide/.test(txt), { sampleQuoteLine: txt.match(/From your guide, p\. \d+: [^\n]*/)?.[0]?.slice(0, 120), droppedLines: (txt.match(/1 question dropped: not found in your guide/g) ?? []).length });
  await alice.getByText("Review questions").scrollIntoViewIfNeeded();
  await shot(alice, "20-review-quote-page-dropped");
} catch (e) {
  record("phase3", "script error", false, String(e).slice(0, 500));
} finally {
  await control(null).catch(() => undefined);
  saveResults("phase3");
  await browser.close();
}
