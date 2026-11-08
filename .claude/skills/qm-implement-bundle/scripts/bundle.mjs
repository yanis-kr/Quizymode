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
    req(typeof it?.ux === "boolean" && typeof it?.migration === "boolean", `${tag}: ux and migration must be booleans`);
    req(Array.isArray(it?.validation), `${tag}: validation must be an array`);
    req(Array.isArray(it?.acceptanceCriteria) && it.acceptanceCriteria.length > 0, `${tag}: at least one acceptance criterion required`);
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
    if (typeof opts.note === "string") it.notes.push(`${now()} ${opts.note}`);
    saveState(p, st, { event: "issue", issue: Number(num), status, note: opts.note });
    ok({ bundleId: id, issue: Number(num), ...it });
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
  default:
    process.stdout.write(`Usage: node bundle.mjs <command> <bundleId> [options]
Refine:  new, snapshot <n...>, check, hash, brief (text), approve --hash <prefix> --user-reply "<text containing approve <prefix>>"
Execute: verify [--gh] [--no-git], state-init [--take-over] (prints holder), then with --holder <h>:
         checkpoint, issue <n> <status> [--note --branch --commit], attempt <n>, ci-run,
         phase <phase> [--pr --previous-main-sha --merge-sha --deploy-run --note], merge-gate --pr <n>,
         blocker --kind k --note t [--issue n], decision --file f [--issue n], release-lock
Anyone:  status (text), list, cancel [--note]
Global:  --bundles-dir <dir> (default <main checkout>/.qm/bundles); --key=value also accepted
`);
    process.exit(cmd ? 1 : 0);
}
