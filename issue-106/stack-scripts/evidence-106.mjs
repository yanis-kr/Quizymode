// Real-HTTP evidence for #138 / #106 against the local #138 API (isolated Postgres, local test issuer).
// Usage: node evidence-106.mjs <outFile>
import fs from "fs";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // localhost dev certificate only
const API = "https://localhost:8082";
const IDP = "https://localhost:7443";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const results = [];
const record = (step, ok, detail) => {
  results.push({ step, outcome: ok === null ? "INFO" : ok ? "PASS" : "FAIL", detail });
  console.log(`[${ok === null ? "INFO" : ok ? "PASS" : "FAIL"}] ${step} ${JSON.stringify(detail)}`);
};
const mint = async (sub, email, groups) =>
  (await (await fetch(`${IDP}/mint?${new URLSearchParams({ sub, email, ...(groups ? { groups } : {}) })}`)).json()).idToken;
const call = async (method, path, token, body) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "User-Agent": UA, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await response.json(); } catch { /* empty body */ }
  return { status: response.status, json };
};

const admin = await mint("admin-local", "admin@local.test", "Admins");
const member = await mint("member-local", "member@local.test");
const run = `run-${Date.now()}`;

// 1. Anonymous visitor: page view + quiz start/complete events.
await call("POST", "/analytics/page-views", null, { path: "/", queryString: "", sessionId: "f-visitor" });
const accepted = await call("POST", "/analytics/events", null, { sessionId: "f-visitor", events: [
  { name: "quick_quiz_started", path: "/", runId: run, total: 5 },
  { name: "quiz_completed", path: "/", runId: run, score: 3, total: 5 }
] });
record("Anonymous POST /analytics/events -> 202", accepted.status === 202, accepted);
const retry = await call("POST", "/analytics/events", null, { sessionId: "f-visitor", events: [{ name: "quick_quiz_started", path: "/", runId: run, total: 5 }] });
record("Retry of the same run is deduplicated", retry.status === 202 && retry.json?.duplicates === 1 && retry.json?.accepted === 0, retry);
const unknown = await call("POST", "/analytics/events", null, { sessionId: "f-visitor", events: [{ name: "not_an_event", path: "/" }] });
record("Unknown event name -> 400", unknown.status === 400, { status: unknown.status });

// 2. Marked browser: internal page view, then funnel events in the same session.
await call("POST", "/analytics/page-views", null, { path: "/", queryString: "", sessionId: "f-marked", internalBrowser: true });
await call("POST", "/analytics/events", null, { sessionId: "f-marked", events: [{ name: "quick_quiz_started", path: "/", runId: `${run}-m`, total: 5 }] });

// 3. Authenticated member events (member@local.test was flagged internal during the #121 run on this DB).
const memberEvents = await call("POST", "/analytics/events", member, { sessionId: "f-member", events: [{ name: "quick_quiz_started", path: "/", runId: `${run}-u`, total: 5 }] });
record("Authenticated POST /analytics/events -> 202", memberEvents.status === 202, memberEvents);

// 4. Authorization on the funnel report.
const anonymousFunnel = await call("GET", "/admin/analytics/funnel?days=1", null);
const memberFunnel = await call("GET", "/admin/analytics/funnel?days=1", member);
const adminFunnel = await call("GET", "/admin/analytics/funnel?days=1", admin);
const includedFunnel = await call("GET", "/admin/analytics/funnel?days=1&includeInternal=true", admin);
record("GET /admin/analytics/funnel without token -> 401", anonymousFunnel.status === 401, { status: anonymousFunnel.status });
record("GET /admin/analytics/funnel as non-admin -> 403", memberFunnel.status === 403, { status: memberFunnel.status });
record("GET /admin/analytics/funnel as admin -> 200", adminFunnel.status === 200, { status: adminFunnel.status });

const started = (f) => f.json.steps.find((s) => s.eventName === "quick_quiz_started");
record("Default funnel excludes the marked-browser and internal-user sessions",
  adminFunnel.json.sessionsWithEvents === 1 && started(adminFunnel).sessions === 1 && adminFunnel.json.internalSessions === 2 && adminFunnel.json.internalExcluded === true,
  { sessionsWithEvents: adminFunnel.json.sessionsWithEvents, quickQuizStarted: started(adminFunnel), internalSessions: adminFunnel.json.internalSessions, internalExcluded: adminFunnel.json.internalExcluded });
record("includeInternal=true brings them back",
  includedFunnel.json.sessionsWithEvents === 3 && started(includedFunnel).sessions === 3 && includedFunnel.json.internalExcluded === false,
  { sessionsWithEvents: includedFunnel.json.sessionsWithEvents, quickQuizStarted: started(includedFunnel), internalExcluded: includedFunnel.json.internalExcluded });
record("Completion step for the anonymous run", null, adminFunnel.json.steps.find((s) => s.eventName === "quiz_completed"));

fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
