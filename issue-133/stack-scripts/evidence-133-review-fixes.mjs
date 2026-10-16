// Re-proof for the #162 review fixes against the local stack (API :8082 Development, SPA :7000, Postgres qm-ev-133).
// 1) A browser error whose message embeds app-relative URLs with query strings: the stored row has none.
// 2) A raw HTTP report with unsanitized relative URLs: the server strips them too.
// 3) Flood with X-Forwarded-For AND sessionId rotated on every request, ~6 KB per report.
//    In Development the API trusts the loopback peer as a proxy (Aspire), so a loopback client's
//    X-Forwarded-For is honoured here; the cap that must hold whatever the client sends is the global
//    ceiling (300 stored per 10 minutes). The per-IP partition against spoofed XFF is proven by the
//    HTTP tests (untrusted peer, and trusted proxy appending the real client).
// Usage: node evidence-133-review-fixes.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const psql = (sql) => execFileSync("docker", ["exec", "qm-ev-133", "psql", "-U", "postgres", "-d", "quizymode", "-P", "pager=off", "-c", sql], { encoding: "utf8" });
const scalar = (sql) => execFileSync("docker", ["exec", "qm-ev-133", "psql", "-U", "postgres", "-d", "quizymode", "-tAc", sql], { encoding: "utf8" }).trim();
const results = [];
const record = (step, outcome, detail) => { results.push({ step, outcome, detail }); console.log(`[${outcome}] ${step} ${JSON.stringify(detail ?? {})}`); };

// 1) Browser.
const browser = await chromium.launch();
const sent = [];
try {
  const context = await browser.newContext({ userAgent: CHROME_UA });
  context.on("request", (r) => { if (r.url().includes("/api/client-errors")) sent.push(JSON.parse(r.postData() ?? "{}")); });
  const page = await context.newPage();
  await page.goto("http://localhost:7000/categories?ref=evidence", { waitUntil: "networkidle" });
  await page.evaluate(() => { setTimeout(() => { throw new Error('No route matches URL "/signup?returnTo=/x&code=123456"'); }, 0); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { Promise.reject(new Error("GET /api/items?search=my+secret failed")); });
  await page.waitForTimeout(1500);
} finally {
  await browser.close();
}
record("Browser payloads already carry no relative-URL query", sent.length === 2 && sent.every((b) => !/[?#]/.test(b.message) && !b.path.includes("?")) ? "PASS" : "FAIL", { messages: sent.map((b) => b.message), paths: sent.map((b) => b.path) });

// 2) Raw HTTP with unsanitized text (as an old or hostile client might send).
const raw = await fetch("https://localhost:8082/client-errors", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": CHROME_UA },
  body: JSON.stringify({
    source: "window", name: "Error", appVersion: "3.58.1", sessionId: "raw-relative-url",
    message: 'No route matches URL "/signup?returnTo=/x&code=654321"',
    stack: "Error: x\n    at go (/src/router.ts?t=99:3:4)\n    at ?state=abc&code=9",
    path: "/signup?returnTo=/x&code=654321#frag",
  }),
});
record("Raw report with relative-URL queries accepted", raw.status === 202 ? "PASS" : "FAIL", { status: raw.status });
const leaks = scalar(`SELECT count(*) FROM "ClientErrors" WHERE "Path" ~ '[?#]' OR "Message" ~ '[?#]' OR coalesce("Stack",'') ~ '[?#]' OR "Message" ~ 'code=|search=|returnTo=' OR coalesce("Stack",'') ~ 'code=|t=99'`);
record("DB: no stored path, message or stack contains a query string or fragment", leaks === "0" ? "PASS" : "FAIL", { rowsWithQuery: leaks });
const rows = psql(`SELECT "Source", "Message", "Path", replace("Stack", E'\\n', ' | ') AS "Stack" FROM "ClientErrors" ORDER BY "OccurredUtc"`);

// 3) Flood with rotated X-Forwarded-For and sessionId.
const before = Number(scalar('SELECT count(*) FROM "ClientErrors"'));
const statuses = [];
for (let i = 0; i < 340; i += 1) {
  const r = await fetch("https://localhost:8082/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": CHROME_UA, "X-Forwarded-For": `203.0.113.${(i % 250) + 1}, 198.18.${Math.floor(i / 250)}.${(i % 250) + 1}` },
    body: JSON.stringify({ source: "window", name: "Error", message: `Rotating flood ${i}`, stack: "s".repeat(4000), componentStack: "c".repeat(2000), path: "/flood", appVersion: "3.58.1", sessionId: `rotate-${i}` }),
  });
  statuses.push(r.status);
}
const after = Number(scalar('SELECT count(*) FROM "ClientErrors"'));
const accepted = statuses.filter((s) => s === 202).length;
const limited = statuses.filter((s) => s === 429).length;
const total = after;
record("Rotating X-Forwarded-For and sessionId cannot store unbounded rows (global ceiling 300 per 10 min)",
  total <= 300 && limited > 0 && after - before === accepted ? "PASS" : "FAIL",
  { sent: 340, accepted, limited, first429At: statuses.indexOf(429) + 1, rowsBefore: before, rowsAfter: after });

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(OUT, "db-rows-relative-urls.txt"), rows);
fs.writeFileSync(path.join(OUT, "flood-statuses.txt"), statuses.map((s, i) => `${i + 1}\t${s}`).join("\n"));
process.exit(results.every((r) => r.outcome === "PASS") ? 0 : 1);
