// Usage: node measure-overflow.mjs <label>   (label = before | after)
// Measures horizontal overflow of the anonymous home page on the local stack (http://localhost:7000).
import { createRequire } from "module";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");

const label = process.argv[2] ?? "run";
const here = dirname(fileURLToPath(import.meta.url));
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const viewports = [
  [195, 422],
  [260, 450],
  [320, 568],
  [390, 844],
  [1280, 900],
];

const browser = await chromium.launch();
const results = [];
for (const [width, height] of viewports) {
  const context = await browser.newContext({ viewport: { width, height }, userAgent: UA });
  const page = await context.newPage();
  await page.goto("http://localhost:7000/", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /play a 5-question quiz/i }).waitFor();
  const metrics = await page.evaluate(async () => {
    const vw = window.innerWidth;
    // Elements whose box extends past the right edge (top 5 by overshoot).
    // Ignore elements clipped by an overflow container (e.g. the horizontal card scrollers).
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") return true;
      }
      return false;
    };
    const offenders = [...document.querySelectorAll("body *")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > 0 && r.right > vw + 0.5 && !clipped(el))
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 5)
      .map(({ el, r }) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") || "").slice(0, 90),
        right: Math.round(r.right),
      }));
    window.scrollTo(10000, 0);
    await new Promise((res) => setTimeout(res, 50));
    const maxScrollX = window.scrollX;
    window.scrollTo(0, 0);
    const cta = [...document.querySelectorAll("a")].find((a) => /play a 5-question quiz/i.test(a.textContent || ""));
    const cr = cta?.getBoundingClientRect();
    return {
      innerWidth: vw,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      maxScrollX,
      ctaBox: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
      ctaFullyInsideHorizontally: cr ? cr.left >= 0 && cr.right <= vw : false,
      elementsPastRightEdge: offenders,
    };
  });
  const cta = page.getByRole("link", { name: /play a 5-question quiz/i });
  const ctaVisible = await cta.isVisible();
  const shot = `screenshots/${label}-${width}x${height}-home.png`;
  await page.screenshot({ path: join(here, shot) });
  const overflowPx = metrics.scrollWidth - metrics.innerWidth;
  const row = { label, viewport: `${width}x${height}`, overflowPx, ctaVisible, ...metrics, screenshot: shot };
  results.push(row);
  console.log(
    `${label} ${width}x${height}: scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth} overflow=${overflowPx}px maxScrollX=${metrics.maxScrollX} ctaVisible=${ctaVisible} ctaInside=${metrics.ctaFullyInsideHorizontally}`
  );
  await context.close();
}
await browser.close();
writeFileSync(join(here, `results-${label}.json`), JSON.stringify(results, null, 2));
