// Browser + HTTP evidence for #121 against the local stack (SPA :7000 -> API :8082 -> isolated Postgres,
// identity from the local test issuer :7443). Usage: node evidence-121.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
const SPA = "http://localhost:7000";
const API = "https://localhost:8082";
const IDP = "https://localhost:7443";
const CLIENT = "quizymode-local-evidence";
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const results = [];
const hits = [];
function record(step, outcome, detail) {
  results.push({ step, outcome, detail });
  console.log(`[${outcome}] ${step} ${detail ? JSON.stringify(detail) : ""}`);
}
async function mint(sub, email, groups) {
  const q = new URLSearchParams({ sub, email, ...(groups ? { groups } : {}) });
  return (await fetch(`${IDP}/mint?${q}`)).json();
}
function setAmplifyTokens({ clientId, sub, idToken, accessToken }) {
  const p = `CognitoIdentityServiceProvider.${clientId}`;
  localStorage.setItem(`${p}.LastAuthUser`, sub);
  localStorage.setItem(`${p}.${sub}.idToken`, idToken);
  localStorage.setItem(`${p}.${sub}.accessToken`, accessToken);
  localStorage.setItem(`${p}.${sub}.refreshToken`, "local-evidence-refresh");
  localStorage.setItem(`${p}.${sub}.clockDrift`, "0");
}
function clearAmplifyTokens(clientId) {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(`CognitoIdentityServiceProvider.${clientId}`)) localStorage.removeItem(key);
  }
}
async function newContext(browser, label) {
  // Same non-headless Chrome UA that Playwright device presets send, so the bot detector does not drop these sessions.
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true, userAgent: CHROME_UA });
  context.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/analytics/page-views")) {
      let body = null;
      try { body = JSON.parse(request.postData() ?? "null"); } catch { body = request.postData(); }
      hits.push({ actor: label, path: body?.path, sessionId: body?.sessionId, internalBrowser: body?.internalBrowser ?? null, bearer: Boolean(request.headers()["authorization"]) });
    }
  });
  return context;
}
async function visit(page, route) {
  await page.goto(`${SPA}${route}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1800); // tracker fires after render; also clears the 1.5s duplicate window
}
async function shot(page, name, highlight) {
  await page.screenshot({ path: path.join(OUT, "screenshots", `${name}.png`), fullPage: true });
  if (!highlight) return;
  const handles = [];
  for (const locator of [].concat(highlight)) {
    if (await locator.count()) handles.push(await locator.first().elementHandle());
  }
  for (const h of handles) await h.evaluate((el) => { el.dataset.prevOutline = el.style.outline; el.style.outline = "4px solid #e11d48"; el.style.outlineOffset = "3px"; });
  await page.screenshot({ path: path.join(OUT, "screenshots", `${name}-highlighted.png`), fullPage: true });
  for (const h of handles) await h.evaluate((el) => { el.style.outline = el.dataset.prevOutline ?? ""; });
}
async function asUser(context, sub, email, groups) {
  const t = await mint(sub, email, groups);
  await context.addInitScript(setAmplifyTokens, { clientId: CLIENT, sub, idToken: t.idToken, accessToken: t.accessToken });
  return t;
}
async function sessionsView(page) {
  await visit(page, "/admin/page-views");
  await page.getByRole("button", { name: /^Sessions/ }).first().click();
  await page.getByRole("button", { name: "24h", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch();
try {
  // A. Anonymous visitor.
  const visitor = await newContext(browser, "A-visitor");
  const vp = await visitor.newPage();
  await visit(vp, "/");
  await visit(vp, "/categories");

  // B. Signed-in member (no groups).
  const member = await newContext(browser, "B-member");
  const memberTokens = await asUser(member, "member-local", "member@local.test");
  const mp = await member.newPage();
  await visit(mp, "/");
  await visit(mp, "/categories");
  await visit(mp, "/collections");

  // C. Admin browsing public pages, then admin pages.
  const admin = await newContext(browser, "C-admin");
  const adminTokens = await asUser(admin, "admin-local", "admin@local.test", "Admins");
  const ap = await admin.newPage();
  await visit(ap, "/categories");
  const beforeAdminRoutes = hits.length;
  for (const route of ["/admin", "/admin/page-views", "/admin/user-settings"]) await visit(ap, route);
  const adminRouteHits = hits.slice(beforeAdminRoutes).filter((h) => h.actor === "C-admin");
  record("/admin/* routes send no page hits", adminRouteHits.length === 0 ? "PASS" : "FAIL", { adminRouteHits });

  // D. Starts anonymous, signs in as admin mid-session (same tab, same sessionStorage).
  const mid = await newContext(browser, "D-mid-session");
  const dp = await mid.newPage();
  await visit(dp, "/");
  await dp.evaluate(setAmplifyTokens, { clientId: CLIENT, sub: "admin-local", idToken: adminTokens.idToken, accessToken: adminTokens.accessToken });
  await visit(dp, "/collections");

  // E. Admin marks this browser, signs out, and a new tab browses anonymously.
  const marked = await newContext(browser, "E-marked-browser");
  const ep = await marked.newPage();
  await visit(ep, "/");
  const markerHitsBefore = hits.filter((h) => h.actor === "E-marked-browser").length;
  await ep.evaluate(setAmplifyTokens, { clientId: CLIENT, sub: "admin-local", idToken: adminTokens.idToken, accessToken: adminTokens.accessToken });
  await visit(ep, "/admin/page-views");
  const toggle = ep.getByLabel(/Exclude this browser from analytics/);
  await toggle.check();
  await shot(ep, "01-exclude-this-browser-checked", ep.locator("label", { hasText: "Exclude this browser from analytics" }));
  const markerValue = await ep.evaluate(() => localStorage.getItem("quizymode.analytics.internal-browser"));
  record("Marker stored in localStorage", markerValue === "true" ? "PASS" : "FAIL", { markerValue });
  await ep.evaluate(clearAmplifyTokens, CLIENT);
  const ep2 = await marked.newPage(); // new tab = new analytics session
  await visit(ep2, "/categories");
  const markedHit = hits.filter((h) => h.actor === "E-marked-browser").slice(markerHitsBefore).find((h) => h.path === "/categories");
  record("Signed-out hit from marked browser carries internalBrowser=true", markedHit?.internalBrowser === true && !markedHit.bearer ? "PASS" : "FAIL", { markedHit });
  const unmarked = hits.filter((h) => h.actor === "A-visitor");
  record("Unmarked visitor hits carry no marker", unmarked.length > 0 && unmarked.every((h) => !h.internalBrowser) ? "PASS" : "FAIL", { count: unmarked.length });

  // F. Admin reports (UI).
  const reporter = await newContext(browser, "F-admin-reports");
  await asUser(reporter, "admin-local", "admin@local.test", "Admins");
  const rp = await reporter.newPage();
  await sessionsView(rp);
  await shot(rp, "02-sessions-default-internal-excluded", rp.getByText(/internal\s+sessions? (was|were) excluded/));
  await rp.getByLabel("Include internal traffic").check();
  await rp.waitForLoadState("networkidle");
  await rp.waitForTimeout(1200);
  await shot(rp, "03-sessions-include-internal", [rp.getByLabel("Include internal traffic"), rp.getByText("Internal", { exact: true })]);

  // G. Retroactive: flag the member on Users & Activity.
  await visit(rp, "/admin/user-settings");
  await rp.getByText("member@local.test").first().click();
  await rp.waitForTimeout(800);
  const internalUser = rp.getByLabel(/Internal user \(exclude from analytics\)/);
  await internalUser.click(); // checked state follows the server response, so wait for it
  await rp.waitForFunction(() => [...document.querySelectorAll("label")].some((l) => l.textContent.includes("Internal user (exclude from analytics)") && l.querySelector("input")?.checked), null, { timeout: 15000 });
  await rp.waitForLoadState("networkidle");
  await rp.waitForTimeout(1200);
  await shot(rp, "04-users-member-flagged-internal", [rp.locator("label", { hasText: "Internal user (exclude from analytics)" }), rp.getByText("Internal", { exact: true })]);
  await sessionsView(rp);
  await shot(rp, "05-sessions-after-member-flagged", rp.getByText(/internal\s+sessions? (was|were) excluded/));

  // H. Direct HTTP authorization checks against the API.
  const users = await (await fetch(`${API}/admin/users?days=1`, { headers: { Authorization: `Bearer ${adminTokens.idToken}` } })).json();
  const memberRow = users.users.find((u) => u.email === "member@local.test");
  const put = (token) => fetch(`${API}/admin/users/${memberRow.id}/internal`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ isInternal: true })
  });
  const anonymousPut = await put(null);
  const memberPut = await put(memberTokens.idToken);
  const adminPut = await put(adminTokens.idToken);
  const memberGet = await fetch(`${API}/admin/page-view-sessions?days=1`, { headers: { Authorization: `Bearer ${memberTokens.idToken}` } });
  record("PUT /admin/users/{id}/internal without token -> 401", anonymousPut.status === 401 ? "PASS" : "FAIL", { status: anonymousPut.status, wwwAuthenticate: anonymousPut.headers.get("www-authenticate") });
  record("PUT /admin/users/{id}/internal as non-admin -> 403", memberPut.status === 403 ? "PASS" : "FAIL", { status: memberPut.status });
  record("PUT /admin/users/{id}/internal as admin -> 200", adminPut.status === 200 ? "PASS" : "FAIL", { status: adminPut.status, body: await adminPut.json() });
  record("GET /admin/page-view-sessions as non-admin -> 403", memberGet.status === 403 ? "PASS" : "FAIL", { status: memberGet.status });

  const sessions = await (await fetch(`${API}/admin/page-view-sessions?days=1`, { headers: { Authorization: `Bearer ${adminTokens.idToken}` } })).json();
  const included = await (await fetch(`${API}/admin/page-view-sessions?days=1&includeInternal=true`, { headers: { Authorization: `Bearer ${adminTokens.idToken}` } })).json();
  record("Report after flagging (default)", "INFO", { sessions: sessions.sessions.map((s) => s.sessionId), internalSessions: sessions.summary.internalSessions, internalExcluded: sessions.summary.internalExcluded });
  record("Report after flagging (includeInternal=true)", "INFO", { sessions: included.sessions.map((s) => ({ id: s.sessionId, internal: s.isInternal, user: s.userEmail })) });
} catch (error) {
  record("script error", "ERROR", { message: String(error?.message ?? error) });
  for (const context of browser.contexts()) for (const page of context.pages()) {
    try { await page.screenshot({ path: path.join(OUT, "screenshots", `error-${Date.now()}.png`) }); } catch {}
  }
} finally {
  fs.writeFileSync(path.join(OUT, "page-view-requests.json"), JSON.stringify(hits, null, 2));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
