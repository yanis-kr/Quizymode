// Anonymous home-page evidence for #107 against the local stack (SPA :7000 -> API :8082 -> throwaway Postgres
// seeded from data/seed-dev). Usage: node evidence-107.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
const SPA = "http://localhost:7000";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const SAMPLE_ID = "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511";

const results = [];
function record(step, outcome, detail) {
  results.push({ step, outcome, detail });
  console.log(`[${outcome}] ${step} ${detail ? JSON.stringify(detail) : ""}`);
}
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, "screenshots", name), ...opts });

const browser = await chromium.launch();

async function newPage(viewport, extra = {}) {
  // Fresh context = empty cookies, localStorage and sessionStorage: an anonymous first-time visitor.
  const context = await browser.newContext({ viewport, userAgent: CHROME_UA, ...extra });
  const page = await context.newPage();
  return { context, page };
}

async function cta(page) {
  return page.getByRole("link", { name: /play a 5-question quiz/i });
}

async function inViewport(page, locator) {
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  return !!box && box.y >= 0 && box.y + box.height <= vp.height && box.x >= 0 && box.x + box.width <= vp.width;
}

const hasHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

// 1 and 2: normal zoom at the two required viewports.
for (const [label, viewport] of [
  ["desktop-1280x900", { width: 1280, height: 900 }],
  ["mobile-390x844", { width: 390, height: 844 }],
]) {
  const { context, page } = await newPage(viewport);
  await page.goto(SPA + "/", { waitUntil: "networkidle" });
  const link = await cta(page);
  await link.waitFor();
  const visibleNoScroll = await inViewport(page, link);
  const noAccount = await page.getByText(/no account needed/i).isVisible();
  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  const overflow = await hasHorizontalOverflow(page);
  record(`${label}: primary action visible without scrolling`, visibleNoScroll ? "PASS" : "FAIL", { box: await link.boundingBox() });
  record(`${label}: five-question size (CTA), no-account text, heading`, noAccount ? "PASS" : "FAIL", { heading, cta: (await link.innerText()).trim() });
  record(`${label}: no horizontal overflow`, overflow ? "FAIL" : "PASS");
  await shot(page, `${label}-home.png`);
  await context.close();
}

// 3: 200% zoom is equivalent to half the CSS-pixel viewport.
for (const [label, viewport] of [
  ["desktop-200pct-640x450", { width: 640, height: 450 }],
  ["mobile-200pct-195x422", { width: 195, height: 422 }],
]) {
  const { context, page } = await newPage(viewport);
  await page.goto(SPA + "/", { waitUntil: "networkidle" });
  const link = await cta(page);
  await link.waitFor();
  const overflow = await hasHorizontalOverflow(page);
  record(`${label}: no horizontal overflow at 200% zoom`, overflow ? "FAIL" : "PASS");
  await link.scrollIntoViewIfNeeded();
  record(`${label}: CTA reachable and operable`, (await link.isVisible()) ? "PASS" : "FAIL");
  await shot(page, `${label}-home.png`);
  await context.close();
}

// 4: keyboard focus ring and accessible name.
{
  const { context, page } = await newPage({ width: 1280, height: 900 });
  await page.goto(SPA + "/", { waitUntil: "networkidle" });
  const link = await cta(page);
  await link.waitFor();
  let focused = false;
  for (let i = 0; i < 20 && !focused; i++) {
    await page.keyboard.press("Tab");
    focused = await link.evaluate((el) => el === document.activeElement);
  }
  record("keyboard: Tab reaches the primary action", focused ? "PASS" : "FAIL", {
    accessibleName: (await link.innerText()).trim(),
    href: await link.getAttribute("href"),
  });
  await shot(page, "desktop-1280x900-keyboard-focus.png");
  await shot(page, "desktop-1280x900-keyboard-focus-zoom.png", { clip: { x: 640, y: 0, width: 640, height: 220 } });
  await context.close();
}

// 5: CTA goes straight to the quiz, no sign-in page, usable question.
{
  const { context, page } = await newPage({ width: 1280, height: 900 });
  const urls = [];
  page.on("framenavigated", (f) => f === page.mainFrame() && urls.push(f.url()));
  await page.goto(SPA + "/", { waitUntil: "networkidle" });
  await (await cta(page)).click();
  await page.waitForURL(new RegExp(`/quiz/collections/${SAMPLE_ID}/`));
  await page.getByText("Question").first().waitFor({ timeout: 10000 });
  const optionVisible = await page.getByText(/^\s*A\./).first().isVisible();
  const sawLogin = urls.some((u) => /\/login(?:[/?#]|$)/.test(u));
  record("CTA opens the public collection quiz directly, no /login, usable question", optionVisible && !sawLogin ? "PASS" : "FAIL", { navigations: urls });
  await shot(page, "desktop-1280x900-quiz-after-cta.png");
  await context.close();
}

// 6: failure states keep hero and category area usable. Each home query is blocked independently, then all together.
const homeQueries = { categories: "**/categories", collections: "**/collections/discover**", featured: "https://localhost:8082/featured*" };
const scenarios = [
  ["categories-fail", ["categories"]],
  ["collections-fail", ["collections"]],
  ["featured-fail", ["featured"]],
  ["all-fail", ["categories", "collections", "featured"]],
];
for (const [label, blocked] of scenarios) {
  const { context, page } = await newPage({ width: 390, height: 844 });
  for (const key of blocked) await page.route(homeQueries[key], (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.goto(SPA + "/", { waitUntil: "networkidle" });
  const link = await cta(page);
  await link.waitFor();
  const usable = (await link.isVisible()) && (await page.getByRole("heading", { level: 1 }).isVisible());
  record(`failure ${label}: hero and CTA stay usable (390x844)`, usable ? "PASS" : "FAIL", { blocked });
  await shot(page, `mobile-390x844-${label}.png`);
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.outcome !== "PASS");
console.log(failed.length ? `FAILED: ${failed.length}` : `ALL PASS: ${results.length}`);
process.exit(failed.length ? 1 : 0);
