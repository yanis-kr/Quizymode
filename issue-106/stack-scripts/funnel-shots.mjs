// Funnel tab screenshots for #138 against the local stack. Usage: node funnel-shots.mjs <outDir>
import { createRequire } from "module";
import path from "path";
import fs from "fs";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const CLIENT = "quizymode-local-evidence";
const t = await (await fetch("https://localhost:7443/mint?sub=admin-local&email=admin%40local.test&groups=Admins")).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" });
await context.addInitScript(({ clientId, idToken, accessToken }) => {
  const p = `CognitoIdentityServiceProvider.${clientId}`;
  localStorage.setItem(`${p}.LastAuthUser`, "admin-local");
  localStorage.setItem(`${p}.admin-local.idToken`, idToken);
  localStorage.setItem(`${p}.admin-local.accessToken`, accessToken);
  localStorage.setItem(`${p}.admin-local.refreshToken`, "local-evidence-refresh");
  localStorage.setItem(`${p}.admin-local.clockDrift`, "0");
}, { clientId: CLIENT, idToken: t.idToken, accessToken: t.accessToken });
const page = await context.newPage();
await page.goto("http://localhost:7001/admin/page-views", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Funnel/ }).first().click();
await page.getByRole("button", { name: "24h", exact: true }).click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);

async function shot(name, locators) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  const handles = [];
  for (const l of locators) if (await l.count()) handles.push(await l.first().elementHandle());
  for (const h of handles) await h.evaluate((el) => { el.style.outline = "4px solid #e11d48"; el.style.outlineOffset = "3px"; });
  await page.screenshot({ path: path.join(OUT, `${name}-highlighted.png`), fullPage: true });
  for (const h of handles) await h.evaluate((el) => { el.style.outline = ""; });
}
await shot("06-funnel-default-internal-excluded", [page.getByText(/internal sessions? (was|were)\s+excluded/)]);
await page.getByLabel("Include internal traffic").check();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);
await shot("07-funnel-include-internal", [page.getByLabel("Include internal traffic"), page.locator("tr", { hasText: "Quick quiz started" })]);
await browser.close();
console.log("done");
