// Renders review-fixes/run.txt + db-rows-relative-urls.txt + the HTTP rate-limit test lines to a PNG.
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const dir = process.argv[2];
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const tests = read("dotnet-test-client-errors.txt").split("\n").filter((l) => /Rotating|TrustedProxy|GlobalCeiling|SameSessionAndFingerprint|RelativeUrl/.test(l)).join("\n");
const text = `== Local stack run (node evidence-133-review-fixes.mjs) ==\n${read("run.txt")}\n== docker exec qm-ev-133 psql: ClientErrors rows from relative-URL reports ==\n${read("db-rows-relative-urls.txt")}\n== xUnit (rate limit keyed on trusted IP, global ceiling, unique index, relative URLs) ==\n${tests}`;
const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.setContent(`<body style="font-family:Segoe UI,Arial;margin:16px"><h2>#162 review fixes: re-proof (local stack, Development)</h2><pre style="font-size:11px;white-space:pre-wrap;background:#f6f8fa;padding:12px;border:1px solid #ddd">${esc}</pre></body>`);
await page.screenshot({ path: path.join(dir, "..", "screenshots", "08-review-fixes-reproof.png"), fullPage: true });
await browser.close();
