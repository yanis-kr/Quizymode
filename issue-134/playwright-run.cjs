const { createRequire } = require("module");
const req = createRequire("C:/Projects/Quizymode-wt-121tests/node_modules/");
const { chromium } = req("playwright");
const fs = require("fs");
const out = process.argv[2];
const BASE = "http://127.0.0.1:7134";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const log = [];
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    // Stub every external call (API, analytics, Cognito) so nothing reaches production.
    return route.fulfill({ status: 200, contentType: "application/json", body: u.includes("/categories") ? '{"categories":[]}' : "[]" });
  });
  const page = await ctx.newPage();
  let step = "";
  page.on("request", (r) => { if (r.url().startsWith(BASE) && /\.(js|css)$/.test(r.url())) log.push(`${step}\t${r.url().replace(BASE, "")}`); });
  const result = {};
  async function visit(name, path, nav) {
    step = name;
    if (nav) await nav(); else await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    result[name] = { url: page.url(), h1: await page.locator("h1").first().textContent().catch(() => null), header: await page.locator("header, nav").count() };
  }
  await visit("1-home", "/");
  await visit("2-quiz", "/quiz");
  // Client-side navigation to a lazy route from the loaded SPA.
  await visit("3-lazy-about", null, async () => { await page.evaluate(() => { history.pushState({}, "", "/about"); dispatchEvent(new PopStateEvent("popstate")); }); await page.waitForLoadState("networkidle"); });
  // Chunk-load failure: block the Roadmap chunk on a fresh tab session.
  step = "4-chunk-fail";
  await page.route(/RoadmapPage-.*\.js$/, (r) => r.abort());
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  let reloads = 0; page.on("load", () => reloads++);
  await page.evaluate(() => { history.pushState({}, "", "/roadmap"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/4-chunk-fail-retry.png` });
  result["4-chunk-fail"] = { url: page.url(), reloads, retryVisible: await page.getByRole("button", { name: "Retry" }).isVisible(), text: await page.getByText("This page failed to load").isVisible() };
  await page.unroute(/RoadmapPage-.*\.js$/);
  step = "5-retry";
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForLoadState("networkidle"); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/5-after-retry.png` });
  result["5-retry"] = { url: page.url(), totalDocumentLoadsAfterFailure: reloads, h1: await page.locator("h1").first().textContent().catch(() => null) };
  fs.writeFileSync(`${out}/network-chunks.tsv`, "step\tasset\n" + log.join("\n") + "\n");
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
