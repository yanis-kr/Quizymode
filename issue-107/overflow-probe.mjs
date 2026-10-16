import { createRequire } from "module";
const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
const b = await chromium.launch();
for (const w of [195, 260, 320]) {
  const p = await (await b.newContext({ viewport: { width: w, height: 422 } })).newPage();
  await p.goto("http://localhost:7000/", { waitUntil: "networkidle" });
  const r = await p.evaluate(async () => { window.scrollTo(300, 0); await new Promise(r => setTimeout(r, 50)); return { scrollX: window.scrollX, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bodyOverflowX: getComputedStyle(document.body).overflowX }; });
  console.log(w, JSON.stringify(r));
}
await b.close();
