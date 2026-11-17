#!/usr/bin/env node
// Bundle manifest/approval/state helper for the qm-refine-bundle and qm-implement-bundle skills.
// Deterministic, dependency-free (Node >= 18). Never prints secrets: it only reads git/gh metadata.
//
// Files per bundle (default <main-checkout>/.qm/bundles/<id>/, gitignored):
//   manifest.json  immutable once approved; approval binds to SHA-256 of its exact bytes
//   approval.json  { manifestSha256, approvedAt, userReply, history[] }
//   state.json     mutable execution state (phase, per-issue status, attempts, blockers, log)
//   summary.md     human-readable summary written by the refine skill
//
// Exit codes: 0 ok, 1 usage/IO error, 2 rejected (validation/approval/identity), 3 limit reached, 4 lock held.

import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceAc } from "../../../../scripts/validation/ac-slice.mjs";
import { ROLES, routeModel, classifyIssue, MODEL_ORDER } from "../../../../scripts/automation/model-policy.mjs";

const SCHEMA_VERSION = 1;
const ID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const ISSUE_STATUSES = ["pending", "in_progress", "implemented", "validated", "integrated", "released", "verified", "closed", "blocked", "deferred", "skipped_already_done", "failed"];
const PHASES = ["not_started", "preflight", "implementing", "integrating", "validating", "release_pr_open", "ci_green", "merged", "deployed", "verified", "done", "done_partial", "blocked_terminal", "cancelled"];
const TERMINAL = new Set(["done", "done_partial", "blocked_terminal", "cancelled"]);
const RELEASE_MODES = ["auto-merge-deploy", "release-pr-only"];
const MIGRATIONS = ["none", "additive-only", "any-reviewed"];
const BLOCKER_KINDS = ["environmental", "dependency", "check-failed", "product-deferred", "source-drift", "limit"];

// ---------- args ----------
const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = [];
const opts = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--") && a.includes("=")) {
    const eq = a.indexOf("=");
    opts[a.slice(2, eq)] = a.slice(eq + 1);
  } else if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) opts[key] = true;
    else { opts[key] = next; i++; }
  } else positional.push(a);
}

function die(code, msg, extra) {
  const out = { ok: false, error: msg, ...(extra || {}) };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exit(code);
}
function ok(obj) {
  process.stdout.write(JSON.stringify({ ok: true, ...obj }, null, 2) + "\n");
  process.exit(0);
}

function sh(file, args, allowFail = false) {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}

// ---------- paths ----------
function mainCheckoutRoot() {
  const common = sh("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], true);
  if (!common) die(1, "Not inside a git repository; pass --bundles-dir.");
  return path.dirname(common);
}
function bundlesDir() {
  if (opts["bundles-dir"]) return path.resolve(String(opts["bundles-dir"]));
  return path.join(mainCheckoutRoot(), ".qm", "bundles");
}
function bundlePaths(id) {
  if (!id || !ID_RE.test(id)) die(1, `Invalid or missing bundle id '${id ?? ""}' (pattern ${ID_RE}).`);
  const dir = path.join(bundlesDir(), id);
  return { dir, manifest: path.join(dir, "manifest.json"), approval: path.join(dir, "approval.json"), state: path.join(dir, "state.json"), summary: path.join(dir, "summary.md") };
}
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { die(1, `Cannot read JSON ${p}: ${e.message}`); }
}
function writeJsonAtomic(p, obj) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);
}
function sha256File(p) { return createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function sha256Text(s) { return createHash("sha256").update(String(s ?? "").replace(/\r\n/g, "\n"), "utf8").digest("hex"); }
const now = () => new Date().toISOString();

// ---------- manifest validation ----------
// ---------- related ACs (#740) ----------
function acMarkdown() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = typeof opts["ac-file"] === "string" ? path.resolve(String(opts["ac-file"])) : path.resolve(here, "..", "..", "..", "..", "docs", "AC.md");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
const REL_KINDS = [["ids", "id", "id"], ["invariants", "invariant", "invariant"], ["headings", "heading", "heading"]];
function relatedAcsErrors(it, tag) {
  if (it?.relatedAcs === undefined) return [];
  const r = it.relatedAcs;
  if (!r || typeof r !== "object" || Array.isArray(r)) return [`${tag}: relatedAcs must be an object { ids, invariants, headings }`];
  const e = [];
  let md;
  for (const [key, arg, label] of REL_KINDS) {
    if (r[key] === undefined) continue;
    if (!Array.isArray(r[key]) || r[key].some((x) => typeof x !== "string" || !x)) { e.push(`${tag}: relatedAcs.${key} must be an array of non-empty strings`); continue; }
    for (const entry of r[key]) {
      md ??= acMarkdown();
      if (!sliceAc(md, { [arg]: entry }).length) e.push(`${tag}: relatedAcs ${label} '${entry}' does not resolve in docs/AC.md`);
    }
  }
  return e;
}
/** Lines of one slice, minus AC and invariant bullets (with their continuation lines) already in 'seen'. Headings stay only above new content. */
function dedupeSlice(lines, seen) {
  const out = [];
  let heading = null;
  let skipping = false;
  for (const line of lines) {
    if (/^#{2,4}\s/.test(line)) { heading = line; skipping = false; continue; }
    if (/^\s*[-*]\s+\*\*(?:AC \d|Invariant )/.test(line)) {
      const key = line.trim();
      skipping = seen.has(key);
      if (skipping) continue;
      seen.add(key);
    } else if (line.trim() === "") {
      skipping = false;
      if (!out.length) continue;
    } else if (skipping) continue;
    if (heading) { if (out.length) out.push(""); out.push(heading); heading = null; }
    out.push(line);
  }
  return out;
}
/** Builds the "Related ACs" lines: issue slice, then each id slice, then each invariant. Exits 2 naming a reference that no longer resolves. */
function relatedAcsFor(issueSlice, rel) {
  const md = acMarkdown();
  const seen = new Set();
  const out = dedupeSlice(issueSlice.split("\n"), seen);
  for (const [key, arg, label] of REL_KINDS.filter((k) => k[0] !== "headings")) {
    for (const entry of rel?.[key] ?? []) {
      const lines = sliceAc(md, { [arg]: entry });
      if (!lines.length) die(2, `Related AC ${label} '${entry}' no longer resolves in docs/AC.md; refine the issue again.`);
      const fresh = dedupeSlice(lines, seen);
      if (fresh.length) out.push("", ...fresh);
    }
  }
  return out;
}
function validateManifest(m, id) {
  const e = [];
  const req = (cond, msg) => { if (!cond) e.push(msg); };
  req(m && typeof m === "object", "manifest is not an object");
  if (!m || typeof m !== "object") return e;
  req(m.schemaVersion === SCHEMA_VERSION, `schemaVersion must be ${SCHEMA_VERSION}`);
  req(m.bundleId === id, `bundleId '${m.bundleId}' does not match folder '${id}'`);
  req(typeof m.title === "string" && m.title.length > 0, "title required");
  req(m.repo && /^[^/\s]+\/[^/\s]+$/.test(m.repo.nameWithOwner ?? ""), "repo.nameWithOwner required (owner/name)");
  req(m.source && /^[0-9a-f]{40}$/.test(m.source.commit ?? "") && !/^0+$/.test(m.source.commit), "source.commit must be a real 40-char SHA");
  req(["patch", "minor", "major"].includes(m.versionBump), "versionBump must be patch, minor or major");
  req(Array.isArray(m.excluded), "excluded must be an array (may be empty)");
  req(typeof m.source?.baseBranch === "string", "source.baseBranch required");
  req(RELEASE_MODES.includes(m.releaseMode), `releaseMode must be one of ${RELEASE_MODES.join(", ")}`);
  req(typeof m.branches?.release === "string" && m.branches.release.length > 0, "branches.release required");
  req(typeof m.branches?.issuePrefix === "string" && m.branches.issuePrefix.length > 0, "branches.issuePrefix required");

  const a = m.authorization ?? {};
  req(typeof a.mergeToMain === "boolean", "authorization.mergeToMain must be boolean");
  req(MIGRATIONS.includes(a.migrations), `authorization.migrations must be one of ${MIGRATIONS.join(", ")}`);
  req(a.paidServices === false, "authorization.paidServices must be false (paid services are never authorized by a manifest)");
  req(a.infraChanges === "none" || a.infraChanges === "listed", "authorization.infraChanges must be 'none' or 'listed'");
  if (a.infraChanges === "listed") req(Array.isArray(a.infraAllowed) && a.infraAllowed.length > 0, "authorization.infraAllowed must list operations when infraChanges is 'listed'");
  req(["none", "test-data-only"].includes(a.prodDataWrites), "authorization.prodDataWrites must be 'none' or 'test-data-only'");
  req(["report-only", "rollback-workflow"].includes(a.rollback), "authorization.rollback must be 'report-only' or 'rollback-workflow'");
  if (m.releaseMode === "auto-merge-deploy") req(a.mergeToMain === true, "releaseMode auto-merge-deploy requires authorization.mergeToMain=true");
  if (m.releaseMode === "release-pr-only") req(a.mergeToMain === false, "releaseMode release-pr-only requires authorization.mergeToMain=false");

  const l = m.limits ?? {};
  for (const k of ["maxAttemptsPerIssue", "maxCiRuns", "maxWallClockHours", "lockStaleMinutes"]) req(Number.isInteger(l[k]) && l[k] > 0, `limits.${k} must be a positive integer`);
  req(Array.isArray(m.releaseGates) && m.releaseGates.length > 0, "releaseGates must be a non-empty array");
  req(["ship-completed-independent", "all-or-nothing"].includes(m.policies?.partialRelease), "policies.partialRelease must be 'ship-completed-independent' or 'all-or-nothing'");
  req(["defer-and-continue", "stop-bundle"].includes(m.policies?.blockedIssue), "policies.blockedIssue must be 'defer-and-continue' or 'stop-bundle'");
  req(["proceed-unless-overlap", "stop-on-any"].includes(m.policies?.sourceDrift), "policies.sourceDrift must be 'proceed-unless-overlap' or 'stop-on-any'");

  req(Array.isArray(m.issues) && m.issues.length > 0, "issues must be a non-empty array");
  const nums = new Set();
  const orders = new Set();
  for (const it of m.issues ?? []) {
    const tag = `issue #${it?.number}`;
    req(Number.isInteger(it?.number) && it.number > 0, `${tag}: number must be a positive integer`);
    req(!nums.has(it?.number), `${tag}: duplicate issue`);
    nums.add(it?.number);
    req(Number.isInteger(it?.order) && !orders.has(it.order), `${tag}: order must be a unique integer`);
    orders.add(it?.order);
    req(typeof it?.title === "string", `${tag}: title required`);
    req(it?.snapshot && typeof it.snapshot.updatedAt === "string" && /^[0-9a-f]{64}$/.test(it.snapshot.bodySha256 ?? ""), `${tag}: snapshot.updatedAt and snapshot.bodySha256 required`);
    req(Array.isArray(it?.scope?.paths), `${tag}: scope.paths must be an array (empty means any change on main overlaps this issue)`);
    req(["low", "medium", "high"].includes(it?.risk), `${tag}: risk must be low, medium or high`);
    req(it?.size === undefined || ["xs", "s", "m", "l"].includes(it.size), `${tag}: size must be xs, s, m or l when set`);
    req(typeof it?.ux === "boolean" && typeof it?.migration === "boolean", `${tag}: ux and migration must be booleans`);
    req(Array.isArray(it?.validation), `${tag}: validation must be an array`);
    req(Array.isArray(it?.acceptanceCriteria) && it.acceptanceCriteria.length > 0, `${tag}: at least one acceptance criterion required`);
    e.push(...relatedAcsErrors(it, tag));
    for (const ac of it?.acceptanceCriteria ?? []) req(typeof ac?.id === "string" && typeof ac?.text === "string" && typeof ac?.evidence === "string", `${tag}: each AC needs id, text, evidence`);
    req(Array.isArray(it?.dependsOn), `${tag}: dependsOn must be an array`);
    if (it?.migration === true) req(a.migrations !== "none", `${tag}: needs a migration but authorization.migrations is 'none'`);
  }
  for (const it of m.issues ?? []) for (const d of it?.dependsOn ?? []) {
    if (typeof d === "number") req(nums.has(d), `issue #${it.number}: dependsOn #${d} is not in the bundle (use {"external": "..."} for outside dependencies)`);
    else req(d && typeof d.external === "string", `issue #${it.number}: dependsOn entries must be issue numbers or {"external": "..."}`);
  }
  // cycle check
  const byNum = new Map((m.issues ?? []).map((i) => [i.number, i]));
  const visiting = new Set(), done = new Set();
  const visit = (n, trail) => {
    if (done.has(n)) return;
    if (visiting.has(n)) { e.push(`dependency cycle: ${[...trail, n].join(" -> ")}`); return; }
    visiting.add(n);
    for (const d of byNum.get(n)?.dependsOn ?? []) if (typeof d === "number" && byNum.has(d)) visit(d, [...trail, n]);
    visiting.delete(n); done.add(n);
  };
  for (const n of byNum.keys()) visit(n, []);
  return e;
}

function loadValidManifest(p, id) {
  if (!fs.existsSync(p.manifest)) die(2, `No manifest for bundle '${id}' at ${p.manifest}. Run qm-refine-bundle first; never substitute another bundle.`);
  const m = readJson(p.manifest);
  const errors = validateManifest(m, id);
  if (errors.length) die(2, "Manifest is invalid", { errors });
  return m;
}

// ---------- git helpers ----------
function originNameWithOwner() {
  const url = sh("git", ["config", "--get", "remote.origin.url"], true);
  if (!url) return null;
  const mm = url.replace(/\.git$/, "").match(/[:/]([^/:]+\/[^/]+)$/);
  return mm ? mm[1] : null;
}
function globToRegex(g) {
  let p = g.replace(/\\/g, "/");
  if (!/[*?]/.test(p)) p = p.replace(/\/$/, "") + "{DIR}"; // bare file or directory: match it and everything below
  const s = p.replace(/[.+^$()|[\]]/g, "\\$&").replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")
    .replace(/\u0001/g, "(?:.*/)?").replace(/\u0000/g, ".*").replace("{DIR}", "(?:/.*)?");
  return new RegExp(`^${s}$`);
}
function overlaps(paths, files) {
  if (!paths.length) return files; // no declared scope: every change counts
  const res = paths.map(globToRegex);
  return files.filter((f) => res.some((r) => r.test(f)));
}
// Conservative glob-vs-glob overlap: compare the literal directory prefix (segments before the first wildcard).
const LANE_IGNORED = new Set(["docs/AC.md", "docs/openapi/quizymode-api.json"]);
const normGlob = (g) => g.replaceAll(String.fromCharCode(92), "/").replace(/\/$/, "");
function globPrefix(g) {
  const out = [];
  for (const sg of normGlob(g).split("/")) { if (/[*?]/.test(sg)) break; out.push(sg); }
  return out;
}
function pathsOverlap(a, b) {
  if (!a.length || !b.length) return true; // no declared scope: assume overlap
  const fa = a.filter((x) => !LANE_IGNORED.has(normGlob(x)));
  const fb = b.filter((x) => !LANE_IGNORED.has(normGlob(x)));
  for (const x of fa) for (const y of fb) {
    const px = globPrefix(x), py = globPrefix(y);
    const n = Math.min(px.length, py.length);
    if (px.slice(0, n).join("/") === py.slice(0, n).join("/")) return true;
  }
  return false;
}
function planLanes(m, st) {
  const todo = [...m.issues].sort((x, y) => x.order - y.order).filter((i) => !["integrated", "released", "verified", "closed", "deferred", "skipped_already_done"].includes(st?.issues?.[String(i.number)]?.status));
  const laneOf = new Map();
  const reasons = [];
  const groups = []; // each group is an array of issues that must share a lane
  for (const it of todo) {
    const linked = [];
    for (const g of groups) {
      const why = g.find((o) => {
        if (it.dependsOn.includes(o.number) || o.dependsOn.includes(it.number)) { reasons.push(`#${it.number} and #${o.number}: dependsOn link`); return true; }
        if (it.migration && o.migration) { reasons.push(`#${it.number} and #${o.number}: both migrations`); return true; }
        if (pathsOverlap(it.scope.paths, o.scope.paths)) { reasons.push(`#${it.number} and #${o.number}: scope.paths overlap`); return true; }
        return false;
      });
      if (why) linked.push(g);
    }
    const merged = [it, ...linked.flat()];
    for (const g of linked) groups.splice(groups.indexOf(g), 1);
    groups.push(merged.sort((x, y) => x.order - y.order));
  }
  const laneA = [], laneB = [];
  for (const g of groups.sort((x, y) => y.length - x.length)) (laneA.length <= laneB.length ? laneA : laneB).push(...g);
  const byOrder = (x, y) => x.order - y.order;
  return { laneA: laneA.sort(byOrder).map((i) => i.number), laneB: laneB.sort(byOrder).map((i) => i.number), reasons };
}
function safeJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function verifyAll(id, p) {
  const m = loadValidManifest(p, id);
  if (!fs.existsSync(p.approval)) die(2, `Bundle '${id}' is not approved (no approval.json). Approve it in a qm-refine-bundle session.`);
  const ap = readJson(p.approval);
  const hash = sha256File(p.manifest);
  if (ap.status !== "approved") die(2, `Approval status is '${ap.status}', not 'approved'.`);
  if (ap.manifestSha256 !== hash) die(2, "Manifest hash does not match the approved hash; the manifest changed after approval. Re-approve in qm-refine-bundle.", { approvedSha256: ap.manifestSha256, currentSha256: hash });

  const warnings = [];
  const drift = { baseMoved: false, changedFiles: [], overlapping: {} };
  const issues = { changed: [], closed: [] };
  if (!opts["no-git"]) {
    const repo = originNameWithOwner();
    if (!repo || repo.toLowerCase() !== m.repo.nameWithOwner.toLowerCase()) die(2, `Repo identity mismatch: origin is '${repo}', manifest is '${m.repo.nameWithOwner}'.`);
    if (sh("git", ["cat-file", "-e", `${m.source.commit}^{commit}`], true) === null) die(2, `source.commit ${m.source.commit} is not present in this clone (run git fetch, or wrong repo).`);
    const baseRef = `origin/${m.source.baseBranch}`;
    const head = sh("git", ["rev-parse", baseRef], true);
    if (!head) warnings.push(`Cannot resolve ${baseRef}; run git fetch origin ${m.source.baseBranch}.`);
    else if (head !== m.source.commit) {
      drift.baseMoved = true;
      drift.currentBaseCommit = head;
      drift.changedFiles = (sh("git", ["diff", "--name-only", m.source.commit, head], true) ?? "").split(/\r?\n/).filter(Boolean);
      for (const it of m.issues) {
        const hit = overlaps(it.scope.paths, drift.changedFiles);
        if (hit.length) drift.overlapping[it.number] = hit;
      }
    }
  }
  if (opts.gh) {
    for (const it of m.issues) {
      const raw = sh("gh", ["issue", "view", String(it.number), "--repo", m.repo.nameWithOwner, "--json", "state,updatedAt,body"], true);
      if (!raw) { issues.unreadable = [...(issues.unreadable ?? []), it.number]; warnings.push(`gh could not read issue #${it.number} (environmental)`); continue; }
      const cur = JSON.parse(raw);
      if (cur.state !== "OPEN") issues.closed.push(it.number);
      if (sha256Text(cur.body) !== it.snapshot.bodySha256) issues.changed.push(it.number);
    }
  }
  return { manifest: m, hash, drift, issues, warnings };
}

// ---------- state ----------
function loadState(p) {
  if (!fs.existsSync(p.state)) die(1, "No state.json; run state-init first.");
  return readJson(p.state);
}
function saveState(p, st, event) {
  st.updatedAt = now();
  if (event) st.log.push({ at: st.updatedAt, ...event });
  writeJsonAtomic(p.state, st);
}
// The holder token comes from state-init output and is passed back with --holder on every executor call.
function holderId() { return typeof opts.holder === "string" ? opts.holder : (process.env.CLAUDE_CODE_SESSION_ID || null); }
function lockIsStale(lock, staleMin) { return !lock || Date.now() - Date.parse(lock.heartbeatAt ?? lock.acquiredAt) > staleMin * 60000; }
function requireHolder(st, m) {
  if (TERMINAL.has(st.phase)) die(2, `Bundle is in terminal phase '${st.phase}'; stop now.`, { phase: st.phase });
  const h = holderId();
  if (!st.lock || st.lock.holder !== h) {
    if (st.lock && !lockIsStale(st.lock, m.limits.lockStaleMinutes)) die(4, `Lock is held by ${st.lock.holder}, not '${h ?? "(no --holder)"}'; stop. Pass the holder printed by state-init.`);
    die(4, "This session does not hold the lock (it expired or was released). Run state-init again.");
  }
  st.lock.heartbeatAt = now();
}
function checkApprovalStillValid(p, st) {
  const hash = sha256File(p.manifest);
  const ap = fs.existsSync(p.approval) ? safeJson(p.approval) : null;
  if (hash !== st.manifestSha256) die(2, "manifest.json changed during execution; stop. It no longer matches the approved revision.");
  if (!ap || ap.status !== "approved" || ap.manifestSha256 !== hash) die(2, "Approval is missing, revoked, or for another revision; stop.");
}

// ---------- packets and handbacks ----------
// Draft ACs from an issue body: "- AC (draft) [verify: m] text" or a checkbox line "- [ ] text [verify: m]" (or "- [x]").
// Any bullet with a [verify: ...] marker counts; a bullet without one is not an AC.
function draftAcs(body) {
  const out = [];
  // Spaces and tabs only: \s would let a match run into the next line.
  for (const m of String(body).matchAll(/^[ \t]*-[ \t]+(?:\[[ xX]\][ \t]+)?(.*?)[ \t]*\[verify:[ \t]*([^\]]+)\][ \t]*(.*)$/gm)) {
    const before = m[1].replace(/^AC\s*\(draft\)\s*/i, "").trim();
    const text = (before || m[3].trim());
    if (!text) continue;
    out.push({ id: `AC${out.length + 1}`, text, evidence: m[2].trim() });
  }
  return out;
}

// Routing is one shared policy (scripts/automation/model-policy.mjs, AC 7.13.3): haiku by default, sonnet and opus only on a
// scored complexity criterion. Each packet line shows the role, its model and why.
const ROLE_DEFAULT = Object.fromEntries(ROLES.map((r) => [r, routeModel(r, {}).model]));
function modelsFor(facts) {
  return Object.fromEntries(ROLES.map((role) => [role, routeModel(role, facts)]));
}
// The attempt never drops below the attempts recorded in state.json; --attempt can only raise it.
function attemptFrom(recorded, requested) {
  const req = requested === undefined ? 1 : Number(requested);
  if (!Number.isInteger(req) || req < 1) die(1, "--attempt must be a positive integer");
  return Math.max(1, req, Number(recorded ?? 0));
}
// Failure of an earlier attempt, for routing. Environment failures are fixed, not escalated; a reasoning failure is the
// one way Sonnet is shown to be insufficient. Without a classification, a second attempt counts as medium complexity.
const FAILURES = ["none", "environment", "unclassified", "reasoning"];
function failureFrom(requested, attempt) {
  if (requested !== undefined) {
    if (!FAILURES.includes(requested)) die(1, `--failure must be one of: ${FAILURES.join(", ")}`);
    return requested;
  }
  return Number(attempt) >= 2 ? "unclassified" : "none";
}
// The model that made the failed attempt, from --prior-model. A reasoning failure escalates one step from it.
function priorModelFrom(requested) {
  if (requested === undefined) return "unknown";
  if (!MODEL_ORDER.includes(requested)) die(1, `--prior-model must be one of: ${MODEL_ORDER.join(", ")}`);
  return requested;
}
function packetChecks(paths, issue, extra) {
  const norm = paths.map((x) => x.replaceAll(String.fromCharCode(92), "/"));
  const has = (pre) => norm.filter((x) => x.startsWith(pre));
  const out = [];
  const web = has("src/Quizymode.Web/").map((x) => x.replace(/\/\*\*.*$/, ""));
  if (web.length) out.push(`npx vitest related --run ${web.join(" ")}`, `eslint ${web.join(" ")}`);
  const feats = new Set(has("src/Quizymode.Api/Features/").map((x) => x.split("/")[3]).filter((x) => x && !/[*?]/.test(x)));
  if (feats.size) out.push(`dotnet test --filter "(${[...feats].map((f) => `FullyQualifiedName~Features.${f}`).join("|")}|FullyQualifiedName~Architecture)&Category!=Postgres"`);
  else if (has("src/Quizymode.Api").length) out.push('dotnet test --filter "FullyQualifiedName~Architecture&Category!=Postgres"');
  if (has("scripts/").length || has(".claude/").length) out.push("node --test scripts/tests/");
  out.push(`node scripts/validation/ac-gate.mjs --issues ${issue}`);
  for (const v of extra ?? []) if (!out.includes(v)) out.push(v);
  return out;
}
function acSliceFor(issue) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(here, "..", "..", "..", "..", "scripts", "validation", "ac-slice.mjs");
  const args = [script, "--issue", String(issue), "--max-lines", "80"];
  if (typeof opts["ac-file"] === "string") args.push("--file", path.resolve(String(opts["ac-file"])));
  return sh("node", args, true) ?? `(no ACs in docs/AC.md carry (#${issue}) yet)`;
}
function renderPacket(p) {
  const L = [`# Work packet: #${p.issue} ${p.title}`, "", `attempt: ${p.attempt} of ${p.maxAttempts}`, `facts (${p.factSource}): size ${p.size}, risk ${p.risk}${p.riskSource ? ` (${p.riskSource})` : ""}, migration ${p.migration}${p.migrationSource ? ` (${p.migrationSource})` : ""}`, ...(p.classification ? [`classification: ${p.classification}`] : []), "", "## Goal", p.goal, ""];
  L.push("## Models by role (dispatch each agent with its role's model)", ...Object.entries(p.models).map(([r, m]) => `- ${r}: ${m.model}. Why: ${m.reason}`), "");
  L.push("## Acceptance criteria", ...p.acs.map((a) => `- ${a.id} [verify: ${a.evidence}] ${a.text}`), "");
  L.push("## Exclusions", ...(p.exclusions.length ? p.exclusions.map((x) => `- ${x}`) : ["- (none)"]), "");
  L.push("## scope.paths", ...(p.paths.length ? p.paths.map((x) => `- ${x}`) : ["- (unknown: none declared; find files by Grep and say what you checked)"]), "");
  L.push("## dependsOn", p.dependsOn.length ? p.dependsOn.map((d) => (typeof d === "number" ? `#${d}` : d.external)).join(", ") : "(none)", "");
  L.push("## Checks to run (filtered only)", ...p.checks.map((c) => `- \`${c}\``), "");
  L.push("## Related ACs (from docs/AC.md; do not open the whole file)", "```", ...p.related, "```", "");
  if (p.relatedNote) L.push(p.relatedNote, "");
  if (p.relatedHeadings?.length) L.push(`Related headings (read with ac-slice.mjs --heading): ${p.relatedHeadings.join("; ")}`, "");
  L.push("## Invariant index (read one with ac-slice.mjs --invariant <id>)", "```", ...p.invariantIndex, "```", "");
  if (p.apiConventions) L.push("## Common API conventions", "```", ...p.apiConventions, "```", "");
  L.push("## Handback", `Your final reply ends with the handback JSON in one fenced json block, in this shape. The orchestrator saves it to \`${p.handbackPattern}\` with \`bundle.mjs handback-save --issue ${p.issue} --role <role> --file <json file>\`. The handback is your claim. It is not test evidence: the filtered command output, \`ac-gate\` and CI are.`,
    "```json", '{"status":"done|failed|blocked","filesChanged":[],"commands":[{"command":"","exitCode":0}],"acEvidence":{"<AC id>":"<file path>"},"acRefsAdded":[],"questions":[]}', "```", "");
  return L.join("\n");
}
function writePacket(p) {
  const md = acMarkdown();
  p.invariantIndex = sliceAc(md, { "invariants-index": true });
  const api = p.paths.some((x) => x.replaceAll(String.fromCharCode(92), "/").startsWith("src/Quizymode.Api/"));
  p.apiConventions = api ? sliceAc(md, { heading: "Common API conventions" }) : null;
  p.related = relatedAcsFor(p.acSlice, p.relatedRefs);
  p.relatedHeadings = p.relatedRefs?.headings ?? [];
  const dir = typeof opts["packets-dir"] === "string" ? path.resolve(String(opts["packets-dir"])) : path.join(mainCheckoutRoot(), ".qm", "packets");
  const hbDir = typeof opts["handbacks-dir"] === "string" ? path.resolve(String(opts["handbacks-dir"])) : path.join(mainCheckoutRoot(), ".qm", "handbacks");
  p.handbackPattern = path.join(hbDir, `${p.issue}-<role>.json`).replaceAll(String.fromCharCode(92), "/");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${p.issue}.md`);
  fs.writeFileSync(file, renderPacket(p), "utf8");
  ok({ packet: file, issue: p.issue, models: p.models, attempt: p.attempt });
}
function validateHandback(h) {
  const e = [];
  if (!h || typeof h !== "object" || Array.isArray(h)) return ["handback must be a JSON object"];
  if (!["done", "failed", "blocked"].includes(h.status)) e.push("status must be done, failed or blocked");
  if (!Array.isArray(h.filesChanged) || h.filesChanged.some((x) => typeof x !== "string")) e.push("filesChanged must be an array of strings");
  if (!Array.isArray(h.commands) || h.commands.some((c) => !c || typeof c.command !== "string" || !Number.isInteger(c.exitCode))) e.push("commands must be an array of { command, exitCode }");
  if (!h.acEvidence || typeof h.acEvidence !== "object" || Array.isArray(h.acEvidence) || Object.values(h.acEvidence).some((v) => typeof v !== "string")) e.push("acEvidence must be an object of AC id to file path");
  else if (h.status === "done" && !Object.keys(h.acEvidence).length) e.push("acEvidence must name at least one AC when status is done");
  if (!Array.isArray(h.questions)) e.push("questions must be an array");
  if (h.acRefsAdded !== undefined && (!Array.isArray(h.acRefsAdded) || h.acRefsAdded.some((x) => typeof x !== "string"))) e.push("acRefsAdded must be an array of strings");
  if (h.status === "done" && Array.isArray(h.commands) && h.commands.some((c) => c && Number.isInteger(c.exitCode) && c.exitCode !== 0)) e.push("a done handback cannot include a command with a nonzero exitCode");
  return e;
}

// ---------- commands ----------
const id = positional[0];
switch (cmd) {
  case "hash": {
    const p = bundlePaths(id);
    if (!fs.existsSync(p.manifest)) die(1, "No manifest.json");
    ok({ bundleId: id, manifestSha256: sha256File(p.manifest) });
  }
  case "check": {
    const p = bundlePaths(id);
    loadValidManifest(p, id);
    ok({ bundleId: id, manifestSha256: sha256File(p.manifest), valid: true });
  }
  case "snapshot": {
    // node bundle.mjs snapshot 501 503 --repo owner/name  -> JSON snapshots to paste into the manifest
    const repo = String(opts.repo ?? originNameWithOwner() ?? "");
    const nums = positional.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!nums.length) die(1, "Usage: snapshot <issue> [issue...] [--repo owner/name]");
    const snaps = nums.map((n) => {
      const raw = sh("gh", ["issue", "view", String(n), "--repo", repo, "--json", "number,title,state,updatedAt,body"], true);
      if (!raw) return { number: n, error: "gh could not read issue" };
      const j = JSON.parse(raw);
      return { number: j.number, title: j.title, snapshot: { state: j.state, updatedAt: j.updatedAt, bodySha256: sha256Text(j.body) } };
    });
    ok({ repo, snapshots: snaps });
  }
  case "approve": {
    const p = bundlePaths(id);
    loadValidManifest(p, id);
    const hash = sha256File(p.manifest);
    const given = String(opts.hash ?? "");
    if (given.length < 8 || !hash.startsWith(given.toLowerCase())) die(2, "Hash given by the user does not match the current manifest. Show the new hash and ask again.", { currentSha256: hash });
    const reply = opts["user-reply"];
    if (typeof reply !== "string" || !reply.trim()) die(1, "--user-reply \"<verbatim user approval text>\" is required");
    const replyHash = (reply.match(/\bapprove\s+([0-9a-f]{8,64})\b/i) ?? [])[1];
    if (!replyHash || replyHash.toLowerCase() !== given.toLowerCase()) die(2, "The user's reply must itself contain 'approve <hash prefix>' matching --hash. An 'ok' to questions is not an approval.");
    const prev = fs.existsSync(p.approval) ? readJson(p.approval) : null;
    if (fs.existsSync(p.state)) die(2, "Execution already started for this bundle; create a new bundle id instead of re-approving a running one.");
    const history = prev ? [...(prev.history ?? []), { manifestSha256: prev.manifestSha256, approvedAt: prev.approvedAt, supersededAt: now() }] : [];
    writeJsonAtomic(p.approval, { schemaVersion: SCHEMA_VERSION, bundleId: id, status: "approved", manifestSha256: hash, approvedAt: now(), approvedBy: "user, in the qm-refine-bundle session", userReply: opts["user-reply"], history });
    ok({ bundleId: id, manifestSha256: hash, approved: true });
  }
  case "verify": {
    const p = bundlePaths(id);
    const r = verifyAll(id, p);
    const stop = (r.manifest.policies.sourceDrift === "stop-on-any" && r.drift.baseMoved) || Boolean(r.issues.unreadable?.length);
    ok({ bundleId: id, manifestSha256: r.hash, releaseMode: r.manifest.releaseMode, drift: r.drift, issues: r.issues, warnings: r.warnings, stopForDrift: stop });
  }
  case "brief": {
    // Phone-sized approval text derived from the manifest bytes, so what the user approves is what the hash covers.
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const hash = sha256File(p.manifest);
    const a = m.authorization;
    const lines = [`Bundle ${id}: ${m.title} (${m.issues.length} issues, ${m.releaseMode})`];
    for (const it of [...m.issues].sort((x, y) => x.order - y.order)) {
      const deps = it.dependsOn.map((d) => (typeof d === "number" ? `#${d}` : d.external)).join(", ");
      lines.push(`${it.order}. #${it.number} ${it.title} | risk ${it.risk}${deps ? ` | after ${deps}` : ""} | ${it.acceptanceCriteria.length} ACs`);
    }
    if (m.excluded.length) lines.push(`Excluded: ${m.excluded.map((x) => `#${x.number} ${x.reason}`).join("; ")}`);
    lines.push(`Merge+deploy: ${a.mergeToMain ? "yes" : "no"}. Migrations: ${a.migrations}. Infra: ${a.infraChanges}. Prod writes: ${a.prodDataWrites}. Rollback: ${a.rollback}. Close issues: ${a.closeIssues ? "yes" : "no"}.`);
    lines.push(`Blocked: ${m.policies.blockedIssue}. Partial: ${m.policies.partialRelease}. Drift: ${m.policies.sourceDrift}.`);
    lines.push(`Limits: ${m.limits.maxAttemptsPerIssue} tries/issue, ${m.limits.maxCiRuns} CI runs, ${m.limits.maxWallClockHours} h.`);
    lines.push(`Reply "approve ${hash.slice(0, 8)}" to approve this exact revision.`);
    process.stdout.write(lines.join("\n") + "\n");
    process.exit(0);
  }
  case "state-init": {
    const p = bundlePaths(id);
    const r = verifyAll(id, p);
    const m = r.manifest;
    const holder = holderId() ?? `h-${randomBytes(6).toString("hex")}`;
    if (fs.existsSync(p.state)) {
      const st = readJson(p.state);
      if (st.manifestSha256 !== r.hash) die(2, "state.json belongs to a different manifest revision; refusing to mix runs.");
      let reopened = false;
      if (st.phase === "blocked_terminal" && opts["take-over"] && st.phaseBeforeTerminal) { st.phase = st.phaseBeforeTerminal; reopened = true; }
      else if (TERMINAL.has(st.phase)) die(2, `Bundle is in terminal phase '${st.phase}'. ${st.phase === "blocked_terminal" ? "Fix the blocker, then run: /qm-implement-bundle " + id + " resume" : "Nothing to resume."}`, { phase: st.phase });
      const foreign = st.lock && st.lock.holder !== holder && !lockIsStale(st.lock, m.limits.lockStaleMinutes);
      if (foreign && !opts["take-over"]) die(4, `Bundle is locked by another session (${st.lock.holder}), heartbeat ${st.lock.heartbeatAt}. If that session is gone, the user can run: /qm-implement-bundle ${id} resume`);
      const previousHolder = st.lock?.holder ?? null;
      st.lock = { holder, acquiredAt: now(), heartbeatAt: now() };
      st.resumeCount = (st.resumeCount ?? 0) + 1;
      st.clockStart = now();
      saveState(p, st, { event: reopened ? "reopened" : foreign ? "taken-over" : "resumed", holder, previousHolder });
      ok({ bundleId: id, holder, resumed: true, reopened, phase: st.phase, issues: st.issues, release: st.release, drift: r.drift, issueChanges: r.issues, warnings: r.warnings });
    }
    // one active bundle per checkout
    for (const other of fs.existsSync(bundlesDir()) ? fs.readdirSync(bundlesDir()) : []) {
      const sp = path.join(bundlesDir(), other, "state.json");
      if (other === id || !fs.existsSync(sp)) continue;
      const os = safeJson(sp);
      if (!os) die(1, `Corrupt state file for bundle '${other}'; inspect ${sp}.`);
      if (!TERMINAL.has(os.phase) && os.lock && !lockIsStale(os.lock, m.limits.lockStaleMinutes)) die(4, `Another bundle '${other}' is active (phase ${os.phase}). One bundle at a time.`);
    }
    const st = {
      schemaVersion: SCHEMA_VERSION, bundleId: id, manifestSha256: r.hash, createdAt: now(), updatedAt: now(), clockStart: now(),
      phase: "preflight", phaseBeforeTerminal: null, lock: { holder, acquiredAt: now(), heartbeatAt: now() }, resumeCount: 0, ciRuns: 0,
      release: { branch: m.branches.release, prNumber: null, previousMainSha: null, mergeSha: null, deployRunId: null },
      issues: Object.fromEntries([...m.issues].sort((x, y) => x.order - y.order).map((i) => [String(i.number), { status: "pending", attempts: 0, branch: null, commit: null, notes: [] }])),
      blockers: [], decisions: [], log: [],
    };
    st.updatedAt = now();
    st.log.push({ at: st.updatedAt, event: "initialized", holder, drift: r.drift.baseMoved });
    try { fs.writeFileSync(p.state, JSON.stringify(st, null, 2) + "\n", { encoding: "utf8", flag: "wx" }); }
    catch { die(4, "Another session created state.json at the same moment; re-run state-init."); }
    ok({ bundleId: id, holder, resumed: false, phase: st.phase, issues: st.issues, drift: r.drift, issueChanges: r.issues, warnings: r.warnings, note: "Pass --holder <holder> to every later command." });
  }
  case "issue": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    const num = String(positional[1] ?? "");
    const status = positional[2];
    if (!st.issues[num]) die(2, `Issue #${num} is not in bundle '${id}'. Scope cannot be expanded during execution.`);
    if (!ISSUE_STATUSES.includes(status)) die(1, `status must be one of ${ISSUE_STATUSES.join(", ")}`);
    const it = st.issues[num];
    it.status = status;
    if (typeof opts.branch === "string") it.branch = opts.branch;
    if (typeof opts.commit === "string") it.commit = opts.commit;
    if (opts.lane !== undefined) { if (opts.lane !== "a" && opts.lane !== "b") die(1, "--lane must be a or b"); it.lane = opts.lane; }
    if (typeof opts.note === "string") it.notes.push(`${now()} ${opts.note}`);
    saveState(p, st, { event: "issue", issue: Number(num), status, note: opts.note });
    ok({ bundleId: id, issue: Number(num), ...it });
  }
  case "lanes": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = fs.existsSync(p.state) ? loadState(p) : null;
    ok(planLanes(m, st));
  }
  case "attempt": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    const num = String(positional[1] ?? "");
    if (!st.issues[num]) die(2, `Issue #${num} is not in bundle '${id}'.`);
    const it = st.issues[num];
    if (it.attempts >= m.limits.maxAttemptsPerIssue) die(3, `Attempt limit (${m.limits.maxAttemptsPerIssue}) reached for #${num}. Record a blocker; do not retry.`, { attempts: it.attempts });
    it.attempts += 1;
    saveState(p, st, { event: "attempt", issue: Number(num), attempts: it.attempts });
    ok({ bundleId: id, issue: Number(num), attempts: it.attempts, remaining: m.limits.maxAttemptsPerIssue - it.attempts });
  }
  case "ci-run": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    if (st.ciRuns >= m.limits.maxCiRuns) die(3, `CI run limit (${m.limits.maxCiRuns}) reached. Stop pushing; record a blocker.`);
    st.ciRuns += 1;
    saveState(p, st, { event: "ci-run", count: st.ciRuns, note: opts.note });
    ok({ bundleId: id, ciRuns: st.ciRuns, remaining: m.limits.maxCiRuns - st.ciRuns });
  }
  case "phase": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    const phase = positional[1];
    if (!PHASES.includes(phase)) die(1, `phase must be one of ${PHASES.join(", ")}`);
    const map = { pr: "prNumber", "previous-main-sha": "previousMainSha", "merge-sha": "mergeSha", "deploy-run": "deployRunId" };
    for (const k of Object.keys(map)) if (typeof opts[k] === "string") st.release[map[k]] = k === "pr" ? Number(opts[k]) : opts[k];
    const needs = { release_pr_open: "prNumber", ci_green: "prNumber", merged: "mergeSha", deployed: "deployRunId" };
    if (needs[phase] && !st.release[needs[phase]]) die(1, `phase ${phase} requires release.${needs[phase]} (pass --${Object.keys(map).find((k) => map[k] === needs[phase])}).`);
    if (phase === "merged" && !st.release.prNumber) die(1, "phase merged requires a recorded PR number.");
    if (TERMINAL.has(phase)) { st.phaseBeforeTerminal = st.phase; st.lock = null; }
    st.phase = phase;
    saveState(p, st, { event: "phase", phase, note: opts.note });
    ok({ bundleId: id, phase, release: st.release });
  }
  case "merge-gate": {
    // Run immediately before `gh pr merge`. Exit 0 means this exact PR may be merged now.
    const p = bundlePaths(id);
    const r = verifyAll(id, p);
    const m = r.manifest;
    const st = loadState(p);
    requireHolder(st, m);
    checkApprovalStillValid(p, st);
    const pr = Number(opts.pr);
    const errs = [];
    if (m.releaseMode !== "auto-merge-deploy" || m.authorization.mergeToMain !== true) errs.push("manifest does not authorize merging to main");
    if (st.phase !== "ci_green") errs.push(`phase is '${st.phase}', must be 'ci_green'`);
    if (!pr || pr !== st.release.prNumber) errs.push(`--pr ${opts.pr ?? "(missing)"} is not the recorded release PR #${st.release.prNumber}`);
    const vals = Object.values(st.issues);
    if (!vals.some((i) => i.status === "integrated")) errs.push("no integrated issue to ship");
    if (vals.some((i) => ["pending", "in_progress", "implemented", "validated"].includes(i.status))) errs.push("some issues are still in progress; finish or defer them first");
    if (m.policies.partialRelease === "all-or-nothing" && vals.some((i) => i.status !== "integrated" && i.status !== "skipped_already_done")) errs.push("partialRelease is all-or-nothing and not every issue is integrated");
    if (errs.length) die(2, "Merge gate closed", { errors: errs });
    saveState(p, st, { event: "merge-gate-open", pr });
    ok({ bundleId: id, pr, mergeAllowed: true });
  }
  case "blocker": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    const kind = String(opts.kind ?? "");
    if (!BLOCKER_KINDS.includes(kind)) die(1, `--kind must be one of ${BLOCKER_KINDS.join(", ")}`);
    if (typeof opts.note !== "string") die(1, "--note is required (factual description, no secrets)");
    const issue = opts.issue ? String(opts.issue) : null;
    if (issue && !st.issues[issue]) die(2, `Issue #${issue} is not in bundle '${id}'.`);
    st.blockers.push({ at: now(), kind, issue: issue ? Number(issue) : null, note: opts.note });
    saveState(p, st, { event: "blocker", kind, issue });
    ok({ bundleId: id, blockers: st.blockers.length });
  }
  case "decision": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    if (typeof opts.file !== "string") die(1, "--file <decision.json> required (the qm-decision-maker result, saved verbatim)");
    const d = readJson(path.resolve(opts.file));
    const need = ["question", "decision", "rationale", "acImpact", "validationRequired", "outcome"];
    const missing = need.filter((k) => !(k in d));
    if (missing.length) die(1, `decision missing fields: ${missing.join(", ")}`);
    if (!["proceed", "defer"].includes(d.outcome)) die(1, "decision.outcome must be 'proceed' or 'defer'");
    if (!["none", "clarifies", "weakens"].includes(d.acImpact)) die(1, "decision.acImpact must be none, clarifies or weakens");
    if (d.outcome === "defer" && !d.deferReason) die(1, "decision.deferReason is required when outcome is defer");
    const issue = opts.issue ? String(opts.issue) : null;
    if (issue && !st.issues[issue]) die(2, `Issue #${issue} is not in bundle '${id}'.`);
    const outcome = d.acImpact === "weakens" ? "defer" : d.outcome; // never proceed on weakened ACs
    const reason = d.deferReason ?? "the only option would weaken an acceptance criterion";
    st.decisions.push({ at: now(), issue: issue ? Number(issue) : null, ...d, appliedOutcome: outcome });
    if (outcome === "defer" && issue) {
      st.issues[issue].status = "deferred";
      st.issues[issue].notes.push(`${now()} deferred by decision: ${reason}`);
      st.blockers.push({ at: now(), kind: "product-deferred", issue: Number(issue), note: reason });
    }
    saveState(p, st, { event: "decision", issue, outcome });
    if (d.acImpact === "weakens") die(2, "A decision may not weaken acceptance criteria; recorded as defer.", { appliedOutcome: outcome });
    ok({ bundleId: id, decisions: st.decisions.length, outcome });
  }
  case "checkpoint": {
    // Call between steps: refuses to continue if cancelled/terminal, approval changed, wall clock exceeded, or lock lost.
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    checkApprovalStillValid(p, st);
    const hours = (Date.now() - Date.parse(st.clockStart ?? st.createdAt)) / 3600000;
    const postMerge = ["merged", "deployed", "verified"].includes(st.phase); // must always finish verification/rollback
    if (hours > m.limits.maxWallClockHours && !postMerge) die(3, `Wall clock limit ${m.limits.maxWallClockHours}h exceeded (${hours.toFixed(1)}h). Record a 'limit' blocker and write the terminal status.`);
    saveState(p, st, null);
    ok({ bundleId: id, phase: st.phase, hoursUsed: Number(hours.toFixed(2)), ciRuns: st.ciRuns, postMerge });
  }
  case "release-lock": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    st.lock = null;
    saveState(p, st, { event: "lock-released" });
    ok({ bundleId: id, lock: null });
  }
  case "cancel": {
    const p = bundlePaths(id);
    if (!fs.existsSync(p.state)) {
      if (!fs.existsSync(p.dir)) die(1, `No bundle '${id}'.`);
      if (fs.existsSync(p.approval)) { const ap = readJson(p.approval); ap.status = "revoked"; ap.revokedAt = now(); writeJsonAtomic(p.approval, ap); }
      ok({ bundleId: id, cancelled: true, note: "Not started; approval revoked." });
    }
    const st = readJson(p.state);
    if (TERMINAL.has(st.phase)) ok({ bundleId: id, cancelled: false, phase: st.phase, note: "Already terminal." });
    st.phase = "cancelled"; st.lock = null;
    saveState(p, st, { event: "cancelled", note: opts.note ?? "cancelled by user" });
    ok({ bundleId: id, cancelled: true, note: "Branches and PRs are left as they are; nothing was deleted." });
  }
  case "status": {
    const p = bundlePaths(id);
    if (!fs.existsSync(p.dir)) die(1, `No bundle '${id}'.`);
    const m = fs.existsSync(p.manifest) ? readJson(p.manifest) : null;
    const ap = fs.existsSync(p.approval) ? readJson(p.approval) : null;
    const st = fs.existsSync(p.state) ? readJson(p.state) : null;
    const hash = fs.existsSync(p.manifest) ? sha256File(p.manifest) : null;
    const lines = [];
    lines.push(`Bundle ${id}: ${m?.title ?? "(no manifest)"}`);
    lines.push(`Approval: ${ap ? `${ap.status}${ap.manifestSha256 === hash ? "" : " (STALE: manifest changed)"}` : "none"}; mode: ${m?.releaseMode ?? "?"}`);
    lines.push(`Phase: ${st?.phase ?? "not started"}${st?.release?.prNumber ? `; PR #${st.release.prNumber}` : ""}${st?.release?.mergeSha ? `; merged ${st.release.mergeSha.slice(0, 8)}` : ""}`);
    if (st) for (const [n, it] of Object.entries(st.issues)) lines.push(`  #${n} ${it.status}${it.attempts ? ` (attempts ${it.attempts})` : ""}${it.notes.length ? ` - ${it.notes.at(-1)}` : ""}`);
    if (st?.blockers?.length) { lines.push("Blockers:"); for (const b of st.blockers) lines.push(`  [${b.kind}]${b.issue ? ` #${b.issue}` : ""} ${b.note}`); }
    if (st?.lock) lines.push(`Lock: ${st.lock.holder}, heartbeat ${st.lock.heartbeatAt}`);
    process.stdout.write(lines.join("\n") + "\n");
    process.exit(0);
  }
  case "list": {
    const dir = bundlesDir();
    const rows = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((d) => ID_RE.test(d)).map((d) => {
      const sp = path.join(dir, d, "state.json"), ap = path.join(dir, d, "approval.json");
      return { bundleId: d, approved: fs.existsSync(ap) ? (safeJson(ap)?.status ?? "corrupt") : "none", phase: fs.existsSync(sp) ? (safeJson(sp)?.phase ?? "corrupt") : "not started" };
    });
    ok({ bundles: rows });
  }
  case "new": {
    const p = bundlePaths(id);
    if (fs.existsSync(p.manifest)) die(2, `Bundle '${id}' already exists; refusing to overwrite.`);
    const here = path.dirname(fileURLToPath(import.meta.url));
    const tpl = path.resolve(here, "..", "..", "qm-refine-bundle", "templates", "manifest.template.json");
    const m = readJson(tpl);
    m.bundleId = id; m.createdAt = now();
    m.branches.release = `release/${id}`; m.branches.issuePrefix = `bundle/${id}/`;
    if (!opts["no-git"]) {
      m.repo.nameWithOwner = originNameWithOwner() ?? m.repo.nameWithOwner;
      m.source.commit = sh("git", ["rev-parse", `origin/${m.source.baseBranch}`], true) ?? m.source.commit;
      m.source.capturedAt = now();
    }
    fs.mkdirSync(p.dir, { recursive: true });
    writeJsonAtomic(p.manifest, m);
    ok({ bundleId: id, manifest: p.manifest, note: "Fill in issues/policies, then run check." });
  }
  case "packet": {
    // packet <bundleId> <issue>  |  packet --from-issue <n> [--issue-json <file>]
    if (opts["from-issue"] !== undefined) {
      const n = Number(opts["from-issue"]);
      if (!Number.isInteger(n) || n <= 0) die(1, "--from-issue needs an issue number");
      const raw = typeof opts["issue-json"] === "string" ? fs.readFileSync(String(opts["issue-json"]), "utf8") : sh("gh", ["issue", "view", String(n), "--json", "title,body,labels"], true);
      if (!raw) die(1, `gh could not read issue #${n}`);
      const j = JSON.parse(raw);
      const labels = (j.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
      const label = (d) => labels.find((l) => l.startsWith(`${d}:`))?.slice(d.length + 1);
      const body = String(j.body ?? "");
      const acs = draftAcs(body);
      if (!acs.length) die(2, `Issue #${n} has no AC lines with a [verify: ...] marker (checkbox or "AC (draft)"); refine it first.`);
      const exclusions = [...body.matchAll(/^\s*Out of scope:\s*(.+)$/gim)].map((m) => m[1].trim());
      const sizeLabel = label("size");
      const size = ["xs", "s", "m", "l"].includes(sizeLabel) ? sizeLabel : "unknown";
      // Lightweight classification from labels, size, body and ACs (model-policy.mjs). Stated values win; a clearly simple
      // issue gets inferred low values; anything else stays unknown, which scores medium and routes to sonnet.
      const cls = classifyIssue({ title: j.title, body, labels, size, acCount: acs.length });
      const { risk, migration, ambiguity, novelty, reasoning } = cls.facts;
      const riskSource = cls.sources.risk;
      const migrationSource = cls.sources.migration;
      const attempt = attemptFrom(undefined, opts.attempt);
      const failure = failureFrom(opts.failure, attempt);
      const priorModel = priorModelFrom(opts["prior-model"]);
      const relLine = /^\s*Related ACs:\s*(.+)$/im.exec(body);
      const refs = relLine ? relLine[1].split(",").map((x) => x.trim()).filter(Boolean) : [];
      const relatedRefs = { ids: refs.filter((x) => /^\d+(?:\.\d+)*$/.test(x)), invariants: refs.filter((x) => /^[A-Z]+\d+$/.test(x)), headings: [] };
      const unknown = refs.filter((x) => !relatedRefs.ids.includes(x) && !relatedRefs.invariants.includes(x));
      if (unknown.length) die(2, `Related ACs line has entries that are neither an AC id nor an invariant id: ${unknown.join(", ")}`);
      writePacket({ relatedRefs, relatedNote: relLine ? null : "related ACs: not refined",  issue: n, title: j.title, goal: j.title, acs, exclusions, paths: [], scopeKnown: false, dependsOn: [], checks: packetChecks([], n), acSlice: acSliceFor(n),
        size, risk, riskSource, migration, migrationSource, attempt, maxAttempts: 2, factSource: "issue labels and body, not checked against the manifest or code",
        classification: cls.reason, models: modelsFor({ size, risk, migration, ambiguity, novelty, reasoning, failure, priorModel }) });
    }
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const hash = sha256File(p.manifest);
    const ap = fs.existsSync(p.approval) ? safeJson(p.approval) : null;
    if (!ap || ap.status !== "approved" || ap.manifestSha256 !== hash) die(2, "Bundle manifest is not approved at its current revision; packets come only from an approved manifest.");
    const num = Number(positional[1]);
    const it = m.issues.find((x) => x.number === num);
    if (!it) die(2, `Issue #${positional[1] ?? ""} is not in bundle '${id}'. Scope cannot be expanded.`);
    const st = fs.existsSync(p.state) ? safeJson(p.state) : null;
    const attempt = attemptFrom(st?.issues?.[String(num)]?.attempts, opts.attempt);
    const size = it.size ?? "unknown";
    const extra = it.validation.filter((v) => /^(npm|npx|dotnet|node|eslint) /.test(v) && !/test:coverage/.test(v) && v !== "dotnet test");
    writePacket({ issue: num, title: it.title, goal: it.scope.summary ?? it.title, acs: it.acceptanceCriteria, exclusions: it.scope.exclusions ?? [], paths: it.scope.paths, scopeKnown: it.scope.paths.length > 0, dependsOn: it.dependsOn,
      relatedRefs: it.relatedAcs, checks: packetChecks(it.scope.paths, num, extra), acSlice: acSliceFor(num), size, risk: it.risk, migration: it.migration,
      attempt, maxAttempts: m.limits.maxAttemptsPerIssue, factSource: "approved manifest", models: modelsFor({ size, risk: it.risk, migration: it.migration, failure: failureFrom(opts.failure, attempt), priorModel: priorModelFrom(opts["prior-model"]) }) });
  }
  case "handback-check": {
    const file = positional[0];
    if (!file) die(1, "Usage: handback-check <file>");
    let h;
    try { h = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); } catch (e) { die(2, `Cannot read handback JSON: ${e.message}`); }
    const errors = validateHandback(h);
    if (errors.length) die(2, "Handback is invalid", { errors });
    ok({ file: path.resolve(file), status: h.status });
  }
  case "handback-save": {
    // handback-save --issue <n> --role <role> --file <json>: saves a specialist's reply JSON as its claim.
    const issue = Number(opts.issue);
    const role = typeof opts.role === "string" ? opts.role : "";
    if (!Number.isInteger(issue) || issue <= 0) die(1, "handback-save needs --issue <n>");
    if (!Object.hasOwn(ROLE_DEFAULT, role)) die(1, `--role must be one of: ${Object.keys(ROLE_DEFAULT).join(", ")}`);
    if (typeof opts.file !== "string") die(1, "handback-save needs --file <json file with the handback>");
    let h;
    try { h = JSON.parse(fs.readFileSync(path.resolve(opts.file), "utf8")); } catch (e) { die(2, `Cannot read handback JSON: ${e.message}`); }
    const errors = validateHandback(h);
    const root = path.resolve(typeof opts["repo-root"] === "string" ? opts["repo-root"] : ".");
    if (h && typeof h.acEvidence === "object" && h.acEvidence) for (const [ac, f] of Object.entries(h.acEvidence)) if (typeof f === "string" && !fs.existsSync(path.resolve(root, f))) errors.push(`acEvidence ${ac} points to a missing file: ${f}`);
    if (errors.length) die(2, "Handback is invalid", { errors });
    const dir = typeof opts["handbacks-dir"] === "string" ? path.resolve(String(opts["handbacks-dir"])) : path.join(mainCheckoutRoot(), ".qm", "handbacks");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${issue}-${role}.json`);
    // Dispatch record (AC 7.13.3): the model this role ran on and why, copied from its packet line.
    const packetsDir = typeof opts["packets-dir"] === "string" ? path.resolve(String(opts["packets-dir"])) : path.join(mainCheckoutRoot(), ".qm", "packets");
    const packetFile = path.join(packetsDir, `${issue}.md`);
    const line = fs.existsSync(packetFile) ? new RegExp(`^- ${role}: (\\w+)\\. Why: (.+)$`, "m").exec(fs.readFileSync(packetFile, "utf8")) : null;
    const dispatch = line ? { role, issue, model: line[1], reason: line[2].trim() } : { role, issue, model: null, reason: "no packet line for this role" };
    writeJsonAtomic(file, { ...h, issue, role, claimed: true, dispatch, savedAt: new Date().toISOString() });
    ok({ saved: file, status: h.status, claimed: true, note: "Recorded as the agent's claim. Verification is the AC gate and CI." });
  }
  default:
    process.stdout.write(`Usage: node bundle.mjs <command> <bundleId> [options]
Refine:  new, snapshot <n...>, check, hash, brief (text), approve --hash <prefix> --user-reply "<text containing approve <prefix>>"
Execute: verify [--gh] [--no-git], state-init [--take-over] (prints holder), then with --holder <h>:
         checkpoint, issue <n> <status> [--note --branch --commit --lane a|b], lanes (read-only: split issues into two path-disjoint lanes), attempt <n>, ci-run,
         phase <phase> [--pr --previous-main-sha --merge-sha --deploy-run --note], merge-gate --pr <n>,
         blocker --kind k --note t [--issue n], decision --file f [--issue n], release-lock
Packets: packet <bundleId> <issue> | packet --from-issue <n> (writes .qm/packets/<n>.md); handback-check <file>; handback-save --issue <n> --role <role> --file <json> (.qm/handbacks/<n>-<role>.json, recorded as a claim)
Anyone:  status (text), list, cancel [--note]
Global:  --bundles-dir <dir> (default <main checkout>/.qm/bundles); --key=value also accepted
`);
    process.exit(cmd ? 1 : 0);
}
