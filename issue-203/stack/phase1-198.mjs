// #198 evidence: PDF + DOCX extraction/sectioning through the UI, plus HTTP rejection checks.
import fs from "fs";
import { chromium, newContext, USERS, SPA, EV, record, saveResults, http, uploadFile, psql, scalar, shot, htmlShot } from "./lib.mjs";

const FILES = `${EV}/files`;
const browser = await chromium.launch();
const out = {};
try {
  // ---- HTTP checks ----
  const png = await uploadFile(USERS.alice, `${FILES}/not-really-a-pdf.pdf`);
  record("#198", "PNG bytes renamed .pdf -> 400 UnsupportedType", png.status === 400 && /UnsupportedType/.test(JSON.stringify(png.body)), { status: png.status, body: png.body, bearer: png.bearer });
  const scanned = await uploadFile(USERS.alice, `${FILES}/scanned-like.pdf`);
  record("#198", "mostly-empty scanned-like PDF -> 400 Scanned", scanned.status === 400 && /Scanned/.test(JSON.stringify(scanned.body)), { status: scanned.status, body: scanned.body, bearer: scanned.bearer });
  const anon = await fetch("https://localhost:8082/study-guides/documents", { method: "POST" });
  record("#198", "anonymous upload -> 401", anon.status === 401, { status: anon.status });
  out.rejections = { png, scanned };

  // ---- UI: upload the PDF ----
  const { context } = await newContext(browser, USERS.alice);
  const page = await context.newPage();
  await page.goto(`${SPA}/study-guide/upload`, { waitUntil: "networkidle" });
  const consent = page.getByRole("button", { name: /I understand/i });
  if (await consent.count()) await consent.click();
  await page.setInputFiles("#study-guide-file", `${FILES}/science-guide-14p.pdf`);
  await page.selectOption("#study-guide-upload-scope-category", "science");
  await page.waitForTimeout(800);
  await page.selectOption("#study-guide-upload-scope-rank1", "biology");
  await page.waitForTimeout(800);
  await page.selectOption("#study-guide-upload-scope-rank2", "cells");
  await shot(page, "01-upload-form-pdf");
  await page.getByRole("button", { name: "Upload study guide" }).click();
  await page.waitForURL(/\/study-guides\/documents\/[0-9a-f-]{36}/, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const pdfDocId = page.url().match(/documents\/([0-9a-f-]{36})/)[1];
  out.pdfDocId = pdfDocId;
  await shot(page, "02-pdf-document-sections", { fullPage: true });
  const pdfBody = await page.locator("body").innerText();
  fs.writeFileSync(`${EV}/logs/198-pdf-document-page.txt`, pdfBody);
  const labels = (pdfBody.match(/pp?\. \d+(?:[–-]\d+)?/g) ?? []);
  record("#198", "UI lists PDF sections with page labels (pp. N–M)", labels.length >= 3 && /14 pages|14 page/i.test(pdfBody), { labelsSeen: [...new Set(labels)].slice(0, 12) });

  // ---- UI: upload the DOCX ----
  await page.goto(`${SPA}/study-guide/upload`, { waitUntil: "networkidle" });
  await page.setInputFiles("#study-guide-file", `${FILES}/history-notes.docx`);
  await page.selectOption("#study-guide-upload-scope-category", "history");
  await page.waitForTimeout(800);
  const r1 = await page.locator("#study-guide-upload-scope-rank1 option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
  await page.selectOption("#study-guide-upload-scope-rank1", r1[0]);
  await page.waitForTimeout(800);
  const r2 = await page.locator("#study-guide-upload-scope-rank2 option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
  await page.selectOption("#study-guide-upload-scope-rank2", r2[0]);
  await page.getByRole("button", { name: "Upload study guide" }).click();
  await page.waitForURL(/\/study-guides\/documents\/[0-9a-f-]{36}/, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const docxDocId = page.url().match(/documents\/([0-9a-f-]{36})/)[1];
  out.docxDocId = docxDocId;
  await shot(page, "03-docx-document-sections", { fullPage: true });
  const docxBody = await page.locator("body").innerText();
  fs.writeFileSync(`${EV}/logs/198-docx-document-page.txt`, docxBody);
  record("#198", "UI lists DOCX sections labelled by heading", /Industrial Revolution/.test(docxBody) && /Railways and Trade/.test(docxBody) && /Social Change/.test(docxBody), { snippet: docxBody.split("\n").filter((l) => /Industrial|Railways|Social/.test(l)).slice(0, 6) });

  // ---- DB: headers / page numbers stripped, markers present ----
  const secs = psql(`select s."Index", s."Label", s."PageStart", s."PageEnd", s."SizeBytes", left(replace(s."Text", E'\\n', ' | '), 110) as text_start from "StudyGuideSections" s where s."DocumentId"='${pdfDocId}' order by s."Index"`);
  const headerRows = scalar(`select count(*) from "StudyGuideSections" where "DocumentId"='${pdfDocId}' and "Text" like '%Quizymode Science Revision Guide%'`);
  const pageNumRows = scalar(`select count(*) from "StudyGuideSections" where "DocumentId"='${pdfDocId}' and "Text" ~ 'Page [0-9]+ of 14'`);
  const markerRows = scalar(`select count(*) from "StudyGuideSections" where "DocumentId"='${pdfDocId}' and "Text" ~ '\\[p\\. [0-9]+\\]'`);
  const totalSecs = scalar(`select count(*) from "StudyGuideSections" where "DocumentId"='${pdfDocId}'`);
  const sample = psql(`select left("Text", 600) as "section 1 text (first 600 chars)" from "StudyGuideSections" where "DocumentId"='${pdfDocId}' and "Index"=0`);
  const maxSize = scalar(`select max("SizeBytes") from "StudyGuideSections" where "DocumentId"='${pdfDocId}'`);
  record("#198", "DB: repeated header line stripped from every section", headerRows === "0", { sectionsWithHeader: headerRows, totalSections: totalSecs });
  record("#198", "DB: 'Page N of 14' footer lines stripped", pageNumRows === "0", { sectionsWithPageNumberLine: pageNumRows });
  record("#198", "DB: every section keeps [p. N] markers; sections <= 10240 bytes", markerRows === totalSecs && Number(maxSize) <= 10240, { sectionsWithMarkers: markerRows, maxSizeBytes: maxSize });
  const docxSecs = psql(`select s."Index", s."Label", s."PageStart", s."SizeBytes", left(replace(s."Text", E'\\n', ' | '), 90) as text_start from "StudyGuideSections" s where s."DocumentId"='${docxDocId}' order by s."Index"`);
  const dbText = `-- PDF sections (document ${pdfDocId})\n${secs}\n-- header/page-number check\nsections containing the repeated header line: ${headerRows}\nsections containing a "Page N of 14" line: ${pageNumRows}\nsections with [p. N] markers: ${markerRows} of ${totalSecs}\n\n${sample}\n-- DOCX sections (document ${docxDocId})\n${docxSecs}`;
  fs.writeFileSync(`${EV}/logs/198-db-sections.txt`, dbText);
  await htmlShot(browser, "04-db-sections-headers-stripped", "#198 DB: PDF sections (headers and page numbers stripped) and DOCX sections", dbText);
  fs.writeFileSync(`${EV}/logs/198-ids.json`, JSON.stringify(out, null, 2));
} catch (e) {
  record("#198", "script error", false, String(e).slice(0, 400));
} finally {
  saveResults("phase1-198");
  await browser.close();
}
