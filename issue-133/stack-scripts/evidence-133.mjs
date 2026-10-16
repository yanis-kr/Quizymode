// Browser + HTTP evidence for #133 (OBS-001 front-end error reporting) against the local stack:
// SPA :7000 (Vite dev, proxies /api) -> API :8082 -> throwaway Postgres (qm-ev-133, :54399).
// Identity comes from the local test issuer :7443 (stack-scripts/fake-oidc.cs), NOT Cognito.
// Usage: node evidence-133.mjs <outDir>
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const require = createRequire("C:/Projects/Quizymode-wt-121tests/package.json");
const { chromium } = require("@playwright/test");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
fs.mkdirSync(path.join(OUT, "local-stack"), { recursive: true });
const SPA = "http://localhost:7000";
const API = "https://localhost:8082";
const IDP = "https://localhost:7443";
const CLIENT = "quizymode-local-evidence";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const results = [];
const requests = [];
function record(step, outcome, detail) {
  results.push({ step, outcome, detail });
  console.log(`[${outcome}] ${step} ${detail ? JSON.stringify(detail) : ""}`);
}
function psql(sql) {
  return execFileSync("docker", ["exec", "qm-ev-133", "psql", "-U", "postgres", "-d", "quizymode", "-P", "pager=off", "-c", sql], {
    encoding: "utf8",
  });
}
function scalar(sql) {
  return execFileSync("docker", ["exec", "qm-ev-133", "psql", "-U", "postgres", "-d", "quizymode", "-tAc", sql], { encoding: "utf8" }).trim();
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
async function newContext(browser, actor) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true, userAgent: CHROME_UA });
  context.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/client-errors")) {
      let body = null;
      try { body = JSON.parse(request.postData() ?? "null"); } catch { body = request.postData(); }
      const entry = {
        actor,
        url: request.url().replace(SPA, ""),
        resourceType: request.resourceType(),
        contentType: request.headers()["content-type"] ?? null,
        bearer: Boolean(request.headers()["authorization"]), // presence only; the token is never written out
        body,
        status: null,
        response: null,
      };
      requests.push(entry);
      request.response().then(async (response) => {
        if (!response) return;
        entry.status = response.status();
        try { entry.response = await response.json(); } catch { entry.response = null; }
      }).catch(() => undefined);
    }
  });
  return context;
}
async function asUser(context, sub, email, groups) {
  const t = await mint(sub, email, groups);
  await context.addInitScript(setAmplifyTokens, { clientId: CLIENT, sub, idToken: t.idToken, accessToken: t.accessToken });
  return t;
}
async function settle(page, ms = 1500) {
  await page.waitForTimeout(ms);
}
async function htmlShot(browser, name, title, preText) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await context.newPage();
  const escaped = preText.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await page.setContent(`<html><body style="font-family:Segoe UI,Arial;margin:16px"><h2 style="margin:0 0 8px">${title}</h2><pre style="font-size:11px;line-height:1.35;white-space:pre-wrap;background:#f6f8fa;padding:12px;border:1px solid #ddd">${escaped}</pre></body></html>`);
  await page.screenshot({ path: path.join(OUT, "screenshots", `${name}.png`), fullPage: true });
  await context.close();
}
const tabRequests = (actor) => requests.filter((r) => r.actor === actor);

const browser = await chromium.launch();
try {
  // ---- A. Anonymous visitor, one tab, unmarked browser ----------------------------------------
  const visitor = await newContext(browser, "A-anonymous");
  const vp = await visitor.newPage();

  // A1. Render error: the featured API returns a malformed body, so HomePage's featuredSets.map throws.
  await vp.route("**/api/featured", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sets: { length: 1 }, collections: [] }) })
  );
  await vp.goto(`${SPA}/?utm_source=evidence&email=jane.doe%40example.com`, { waitUntil: "networkidle" });
  await vp.getByText("Something went wrong").waitFor({ timeout: 15000 });
  await settle(vp);
  await vp.screenshot({ path: path.join(OUT, "screenshots", "01-render-error-fallback.png"), fullPage: true });
  const sessionId = await vp.evaluate(() => sessionStorage.getItem("quizymode.analytics.session-id"));
  await vp.unroute("**/api/featured");
  const afterRender = tabRequests("A-anonymous");
  record("Render error caught by ErrorBoundary is reported once (source=boundary, componentStack, path, appVersion, sessionId)",
    afterRender.length === 1 && afterRender[0].body.source === "boundary" && afterRender[0].body.componentStack && afterRender[0].body.path === "/" && afterRender[0].body.appVersion && afterRender[0].body.sessionId === sessionId ? "PASS" : "FAIL",
    { requests: afterRender.length, source: afterRender[0]?.body?.source, path: afterRender[0]?.body?.path, appVersion: afterRender[0]?.body?.appVersion, sessionId: afterRender[0]?.body?.sessionId, hasComponentStack: Boolean(afterRender[0]?.body?.componentStack), transport: afterRender[0]?.resourceType });

  // Reload in the same tab: a working page (sessionStorage, so the same analytics session).
  await vp.goto(`${SPA}/categories`, { waitUntil: "networkidle" });
  await settle(vp, 800);

  // A2. Plain runtime error (uncaught, from a timer), thrown 5 times with the same message.
  for (let i = 0; i < 5; i += 1) {
    await vp.evaluate(() => {
      setTimeout(() => {
        throw new Error("Evidence runtime error for jane.doe@example.com at https://localhost:7000/quiz?token=SECRET123#frag");
      }, 0);
    });
    await settle(vp, 300);
  }
  await settle(vp);
  const runtime = tabRequests("A-anonymous").filter((r) => r.body.source === "window" && r.body.message.startsWith("Evidence runtime error"));
  record("Plain runtime error (window error event) is captured", runtime.length >= 1 ? "PASS" : "FAIL", { message: runtime[0]?.body?.message });
  record("Same runtime error thrown 5 times in one tab is sent once", runtime.length === 1 ? "PASS" : "FAIL", { sent: runtime.length });

  // A3. Unhandled promise rejection.
  await vp.evaluate(() => { Promise.reject(new Error("Evidence unhandled rejection")); });
  await settle(vp);
  const rejection = tabRequests("A-anonymous").filter((r) => r.body.source === "promise" && r.body.message === "Evidence unhandled rejection");
  record("Unhandled promise rejection is captured", rejection.length === 1 ? "PASS" : "FAIL", { sent: rejection.length });

  // A4. Chunk/script load failures: a dynamic import of a missing chunk, and a missing <script>.
  await vp.evaluate(() => { void import(/* @vite-ignore */ "/assets/missing-chunk-Ab12Cd34.js?sig=SECRET456"); });
  await settle(vp);
  await vp.evaluate(() => {
    const s = document.createElement("script");
    s.src = "/assets/legacy-missing-Zz99Yy88.js?sig=SECRET789";
    document.head.appendChild(s);
  });
  await settle(vp);
  const dynamicImport = tabRequests("A-anonymous").filter((r) => /dynamically imported module|Failed to fetch|import/i.test(r.body.message) && r.body.source === "promise");
  const scriptLoad = tabRequests("A-anonymous").filter((r) => r.body.name === "ChunkLoadError");
  record("Failed dynamic import of a missing chunk is captured (unhandled rejection)", dynamicImport.length === 1 ? "PASS" : "FAIL", { message: dynamicImport[0]?.body?.message });
  record("Failed <script> load is captured as ChunkLoadError", scriptLoad.length === 1 ? "PASS" : "FAIL", { message: scriptLoad[0]?.body?.message });

  // A5. Error loop: 15 distinct errors in the same tab. The tab may send at most 10 reports in total.
  await vp.evaluate(() => {
    for (let i = 1; i <= 15; i += 1) {
      setTimeout(() => { throw new Error(`Evidence flood error number ${String.fromCharCode(96 + i)}`); }, i * 20);
    }
  });
  await settle(vp, 2500);
  const tabA = tabRequests("A-anonymous");
  record("At most 10 reports leave one tab; the 11th+ distinct errors are not sent", tabA.length === 10 ? "PASS" : "FAIL", {
    sentFromTab: tabA.length,
    floodSent: tabA.filter((r) => r.body.message.startsWith("Evidence flood")).length,
  });
  record("Anonymous reports use sendBeacon with a text/plain body", tabA.every((r) => r.resourceType === "beacon" || r.resourceType === "ping" || (r.contentType ?? "").startsWith("text/plain")) ? "PASS" : "FAIL",
    { resourceTypes: [...new Set(tabA.map((r) => r.resourceType))], contentTypes: [...new Set(tabA.map((r) => r.contentType))] });
  record("UI still works after reporting (categories page rendered, no fallback)", (await vp.getByText("Something went wrong").count()) === 0 ? "PASS" : "FAIL");
  await vp.screenshot({ path: path.join(OUT, "screenshots", "02-page-still-usable-after-errors.png") });

  // ---- B. Browser carrying the internal marker (#121) -----------------------------------------
  const marked = await newContext(browser, "B-internal-marker");
  await marked.addInitScript(() => localStorage.setItem("quizymode.analytics.internal-browser", "true"));
  const bp = await marked.newPage();
  await bp.goto(`${SPA}/categories`, { waitUntil: "networkidle" });
  await bp.evaluate(() => { setTimeout(() => { throw new Error("Evidence error from internal browser"); }, 0); });
  await settle(bp);
  const markedReq = tabRequests("B-internal-marker")[0];
  record("Marked browser sends internalBrowser=true", markedReq?.body?.internalBrowser === true ? "PASS" : "FAIL", { internalBrowser: markedReq?.body?.internalBrowser });

  // ---- C. Signed-in member (test issuer, no groups) -------------------------------------------
  const member = await newContext(browser, "C-member");
  const memberTokens = await asUser(member, "member-local-133", "member133@local.test");
  const mp = await member.newPage();
  await mp.goto(`${SPA}/categories`, { waitUntil: "networkidle" });
  await settle(mp, 800);
  await mp.evaluate(() => { setTimeout(() => { throw new Error("Evidence error from signed-in member"); }, 0); });
  await settle(mp);
  const memberReq = tabRequests("C-member")[0];
  record("Signed-in report goes by keepalive fetch with a bearer token (application/json)", memberReq && memberReq.bearer && (memberReq.contentType ?? "").startsWith("application/json") ? "PASS" : "FAIL",
    { resourceType: memberReq?.resourceType, contentType: memberReq?.contentType, bearer: memberReq?.bearer });

  await settle(mp, 1000);

  // ---- D. HTTP checks directly against the API ------------------------------------------------
  const countRows = () => Number(scalar('SELECT count(*) FROM "ClientErrors"'));
  const before400 = countRows();
  const bad = [
    ["unknown source", { source: "console", message: "x", path: "/", sessionId: "http-bad-1" }],
    ["absolute path", { source: "window", message: "x", path: "https://evil.example/", sessionId: "http-bad-2" }],
    ["blank message", { source: "window", message: "  ", path: "/", sessionId: "http-bad-3" }],
    ["session id with spaces", { source: "window", message: "x", path: "/", sessionId: "has spaces" }],
  ];
  const badStatuses = {};
  for (const [label, body] of bad) {
    const r = await fetch(`${API}/client-errors`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": CHROME_UA }, body: JSON.stringify(body) });
    badStatuses[label] = r.status;
  }
  const notJson = await fetch(`${API}/client-errors`, { method: "POST", headers: { "Content-Type": "text/plain", "User-Agent": CHROME_UA }, body: "not json" });
  badStatuses["not JSON"] = notJson.status;
  const big = await fetch(`${API}/client-errors`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": CHROME_UA }, body: JSON.stringify({ source: "window", message: "x".repeat(40000), path: "/", sessionId: "http-big" }) });
  badStatuses["40 KB body"] = big.status;
  const after400 = countRows();
  record("Invalid payloads return 400 (oversized body 413) and store nothing",
    Object.entries(badStatuses).every(([k, s]) => (k === "40 KB body" ? s === 413 : s === 400)) && after400 === before400 ? "PASS" : "FAIL",
    { badStatuses, rowsBefore: before400, rowsAfter: after400 });

  // Rate limit: a script posting valid reports, each with a new session so only the limiter can stop it.
  const beforeFlood = countRows();
  const floodStatuses = [];
  for (let i = 0; i < 40; i += 1) {
    const r = await fetch(`${API}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": CHROME_UA },
      body: JSON.stringify({ source: "window", name: "Error", message: "Evidence HTTP flood", path: "/flood", appVersion: "3.58.0", sessionId: `http-flood-${i}` }),
    });
    floodStatuses.push(r.status);
  }
  const afterFlood = countRows();
  const accepted = floodStatuses.filter((s) => s === 202).length;
  const limited = floodStatuses.filter((s) => s === 429).length;
  record("Flood is capped: requests beyond the 30-per-10-minutes budget get 429 and store nothing",
    limited > 0 && afterFlood - beforeFlood === accepted && floodStatuses.indexOf(429) > 0 && floodStatuses.slice(floodStatuses.indexOf(429)).every((s) => s === 429) ? "PASS" : "FAIL",
    { sent: 40, accepted, limited, first429At: floodStatuses.indexOf(429) + 1, rowsAdded: afterFlood - beforeFlood, statuses: floodStatuses.join(",") });

  // ---- E. Admin report (API + UI) ------------------------------------------------------------
  const adminTokens = await mint("admin-local-133", "admin133@local.test", "Admins");
  const memberGet = await fetch(`${API}/admin/client-errors?days=1`, { headers: { Authorization: `Bearer ${memberTokens.idToken}` } });
  const anonGet = await fetch(`${API}/admin/client-errors?days=1`);
  record("Admin report: anonymous 401, non-admin 403", anonGet.status === 401 && memberGet.status === 403 ? "PASS" : "FAIL", { anonymous: anonGet.status, member: memberGet.status });
  const getJson = async (url, token) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); const t = await r.text(); if (r.status !== 200) throw new Error(`GET ${url} -> ${r.status}`); return JSON.parse(t); };
  const adminDefault = await getJson(`${API}/admin/client-errors?days=1`, adminTokens.idToken);
  const adminInternal = await getJson(`${API}/admin/client-errors?days=1&includeInternal=true`, adminTokens.idToken);
  fs.writeFileSync(path.join(OUT, "local-stack", "admin-client-errors-default.json"), JSON.stringify(adminDefault, null, 2));
  fs.writeFileSync(path.join(OUT, "local-stack", "admin-client-errors-include-internal.json"), JSON.stringify(adminInternal, null, 2));
  const hasInternalGroup = (r) => r.groups.some((g) => g.message === "Evidence error from internal browser");
  record("Admin report excludes the internal-marker session by default and includes it with includeInternal=true",
    !hasInternalGroup(adminDefault) && hasInternalGroup(adminInternal) && adminDefault.internalSessions >= 1 ? "PASS" : "FAIL",
    { defaultGroups: adminDefault.totalGroups, includeInternalGroups: adminInternal.totalGroups, internalSessions: adminDefault.internalSessions });
  const floodGroup = adminDefault.groups.find((g) => g.message === "Evidence HTTP flood");
  record("Admin groups by fingerprint (HTTP flood rows form one group with one session each)", floodGroup && floodGroup.count === accepted && floodGroup.sessions === accepted ? "PASS" : "FAIL",
    { count: floodGroup?.count, sessions: floodGroup?.sessions, fingerprint: floodGroup?.fingerprint });

  const adminCtx = await newContext(browser, "E-admin-ui");
  await asUser(adminCtx, "admin-local-133", "admin133@local.test", "Admins");
  const ap = await adminCtx.newPage();
  await ap.goto(`${SPA}/admin/client-errors`, { waitUntil: "networkidle" });
  await ap.getByRole("heading", { name: "Client errors" }).waitFor();
  await settle(ap, 1200);
  await ap.screenshot({ path: path.join(OUT, "screenshots", "03-admin-client-errors.png"), fullPage: true });
  const renderCard = ap.locator('[data-testid="client-error-group"]', { hasText: "featuredSets.map is not a function" });
  if (await renderCard.count()) {
    await renderCard.locator("summary").click();
    await renderCard.getByRole("button", { name: "Show sample session journey" }).click();
    await settle(ap, 1500);
    await renderCard.scrollIntoViewIfNeeded();
    await renderCard.screenshot({ path: path.join(OUT, "screenshots", "04-admin-render-error-group-expanded.png") });
  }
  record("Admin UI lists the render-error group", (await renderCard.count()) === 1 ? "PASS" : "FAIL");
  const memberUi = await member.newPage();
  await memberUi.goto(`${SPA}/admin/client-errors`, { waitUntil: "networkidle" });
  record("Non-admin opening /admin/client-errors is redirected home", new URL(memberUi.url()).pathname === "/" ? "PASS" : "FAIL", { landedOn: new URL(memberUi.url()).pathname });

  // ---- F. Stored rows ----------------------------------------------------------------------------
  await settle(vp, 500);
  const rowsText = psql(`SELECT "Source", "ErrorName", left("Message", 90) AS "Message", "Path", "AppVersion", left("SessionId", 13) AS "Session", "UserId" IS NOT NULL AS "HasUser", "IsAuthenticated" AS "Auth", "DeviceClass", "IsBot", "IsInternal", length("Stack") AS "StackLen", length("ComponentStack") AS "CompStackLen", left("Fingerprint", 12) AS "Fp" FROM "ClientErrors" WHERE "SessionId" NOT LIKE 'http-flood-%' ORDER BY "OccurredUtc"`);
  const perSession = psql(`SELECT left("SessionId", 36) AS "SessionId", count(*) AS "Rows", count(DISTINCT "Fingerprint") AS "DistinctFingerprints", bool_or("IsInternal") AS "Internal" FROM "ClientErrors" GROUP BY "SessionId" ORDER BY "Rows" DESC LIMIT 8`);
  const privacy = psql(`SELECT count(*) FILTER (WHERE "Path" LIKE '%?%' OR "Path" LIKE '%#%') AS "PathsWithQuery",
    count(*) FILTER (WHERE "Message" ~ 'SECRET|token=|sig=' OR "Stack" ~ 'SECRET|token=|sig=' OR "ComponentStack" ~ 'SECRET') AS "RowsWithSecrets",
    count(*) FILTER (WHERE "Message" ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}' OR "Stack" ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}') AS "RowsWithEmails",
    max(length("Message")) AS "MaxMessage", max(length("Stack")) AS "MaxStack", max(length("ComponentStack")) AS "MaxComponentStack", max(length("Path")) AS "MaxPath", count(*) AS "TotalRows"
    FROM "ClientErrors"`);
  const sampleRow = psql(`SELECT "Message", "Stack" FROM "ClientErrors" WHERE "Message" LIKE 'Evidence runtime error%' OR "ErrorName" = 'ChunkLoadError' OR "Message" LIKE '%dynamically imported%'`);
  const dbText = `-- ClientErrors rows from browser sessions (HTTP flood rows summarized below)\n${rowsText}\n-- Rows per session\n${perSession}\n-- Privacy / bounds checks over ALL rows\n${privacy}\n-- Sanitized message/stack samples (query strings and email removed)\n${sampleRow}`;
  fs.writeFileSync(path.join(OUT, "local-stack", "db-client-errors.txt"), dbText);
  const sessionRows = Number(scalar(`SELECT count(*) FROM "ClientErrors" WHERE "SessionId" = '${sessionId}'`));
  const dupRows = Number(scalar(`SELECT count(*) FROM "ClientErrors" WHERE "Message" LIKE 'Evidence runtime error%'`));
  record("DB: anonymous tab stored exactly 10 rows; repeated runtime error stored once", sessionRows === 10 && dupRows === 1 ? "PASS" : "FAIL", { sessionRows, runtimeErrorRows: dupRows });
  const privacyCounts = scalar(`SELECT count(*) FILTER (WHERE "Path" LIKE '%?%' OR "Path" LIKE '%#%') || ',' || count(*) FILTER (WHERE "Message" ~ 'SECRET|token=|sig=' OR coalesce("Stack",'') ~ 'SECRET|token=|sig=') || ',' || count(*) FILTER (WHERE "Message" ~* 'jane\\.doe|@example\\.com' OR coalesce("Stack",'') ~* 'jane\\.doe|@example\\.com') FROM "ClientErrors"`);
  record("DB: no query strings, secrets, or emails stored", privacyCounts === "0,0,0" ? "PASS" : "FAIL", { pathsWithQuery_secretRows_emailRows: privacyCounts });
  const internalRow = scalar(`SELECT "IsInternal" FROM "ClientErrors" WHERE "Message" = 'Evidence error from internal browser'`);
  const memberRow = scalar(`SELECT "IsAuthenticated" || ',' || ("UserId" IS NOT NULL) || ',' || "IsInternal" FROM "ClientErrors" WHERE "Message" = 'Evidence error from signed-in member'`);
  const anonInternal = scalar(`SELECT count(*) FROM "ClientErrors" WHERE "SessionId" = '${sessionId}' AND "IsInternal"`);
  record("DB: internal flag per #121 (marker row internal, anonymous/member rows not)", internalRow === "t" && anonInternal === "0" && memberRow === "true,true,false" ? "PASS" : "FAIL",
    { markerRowInternal: internalRow, anonymousInternalRows: anonInternal, memberRow_auth_hasUser_internal: memberRow });
  const botRows = scalar(`SELECT count(*) FROM "ClientErrors" WHERE "IsBot"`);
  record("DB: normal Chrome UA rows are not bot-flagged; device class desktop", botRows === "0" ? "PASS" : "FAIL", { botRows, devices: scalar(`SELECT string_agg(DISTINCT "DeviceClass", ',') FROM "ClientErrors"`) });

  // Network screenshot data.
  const networkText = requests.map((r, i) => {
    const b = typeof r.body === "object" && r.body ? { ...r.body } : r.body;
    if (b && b.stack) b.stack = `${b.stack.split("\n").slice(0, 3).join("\n")}\n...(${r.body.stack.length} chars)`;
    if (b && b.componentStack) b.componentStack = `${b.componentStack.trim().split("\n").slice(0, 3).join("\n")}\n...(${r.body.componentStack.length} chars)`;
    return `#${i + 1} [${r.actor}] POST ${r.url}  type=${r.resourceType}  content-type=${r.contentType}  bearer=${r.bearer}  -> ${r.status ?? "(beacon: no response exposed)"} ${r.response ? JSON.stringify(r.response) : ""}\n${JSON.stringify(b, null, 2)}`;
  }).join("\n\n");
  fs.writeFileSync(path.join(OUT, "local-stack", "client-error-requests.json"), JSON.stringify(requests, null, 2));
  await htmlShot(browser, "05-network-requests", "Captured POST /api/client-errors requests (Playwright request log, real Chromium)", networkText);
  await htmlShot(browser, "06-db-rows", "docker exec qm-ev-133 psql: ClientErrors", dbText);
  const httpText = results.filter((r) => /HTTP|400|429|Admin report/.test(r.step)).map((r) => `[${r.outcome}] ${r.step}\n${JSON.stringify(r.detail, null, 2)}`).join("\n\n");
  await htmlShot(browser, "07-http-validation-and-rate-limit", "Direct HTTP checks against https://localhost:8082", httpText);
} finally {
  fs.writeFileSync(path.join(OUT, "local-stack", "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
const failed = results.filter((r) => r.outcome !== "PASS");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
