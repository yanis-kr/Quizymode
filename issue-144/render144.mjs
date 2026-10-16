// Renders the captured console output of the #144 checks into an image (a render of real captured text, not a terminal capture).
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");

const dir = "C:/Projects/Quizymode-wt-evidence/issue-144";
const read = (f) => fs.readFileSync(`${dir}/${f}`, "utf8").replace(/^\uFEFF/, "").replace(/\r/g, "");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const pester = read("pester.txt").split("\n");
const keep = pester.filter((l) => /usage|Passed:|Tests completed/i.test(l) || /^Describing .*usage/i.test(l));
const body =
  "# scripts/automation/Run-Tests.ps1 (usage-related lines and totals, from pester.txt)\n" +
  keep.join("\n") +
  "\n\n# " + read("usage-summary-synthetic.txt");
fs.mkdirSync(`${dir}/screenshots`, { recursive: true });
const html = `<body style="background:#0c0c0c;color:#ccc;font:14px Consolas,monospace;padding:16px;white-space:pre">${esc(body)}</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 980, height: 600 } });
await page.setContent(html);
await page.screenshot({ path: `${dir}/screenshots/01-pester-and-usage-summary-render.png`, fullPage: true });
await browser.close();
