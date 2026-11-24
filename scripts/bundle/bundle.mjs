#!/usr/bin/env node
// Bundle manifest/approval/state helper for the qm-bundle-refine and qm-bundle-ship skills.
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
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceAc } from "../validation/ac-slice.mjs";
import { ROLES, routeModel, classifyIssue, MODEL_ORDER } from "../automation/model-policy.mjs";
import { readRun, writeRun, runFilePath, STALL_AFTER_BLOCKS } from "./autopilot-run.mjs";
import { checkUserReply } from "./approval-reply.mjs";
import { ISSUE_STATUSES, transitionError, releaseSlotHolder, VALIDATION_KINDS, validationOutcome } from "./transitions.mjs";
import { selectIssues, lockedIssues } from "./select.mjs";
import { openBlockers, resolveBlocker } from "./blockers.mjs";
import { effectivePaths, overlappingFiles, pathsOverlap, normGlob } from "./scope.mjs";
import { MUTEX_NAMES, MUTEX_STALE_MINUTES, acquireMutex, releaseMutex } from "./mutex.mjs";
import { planWorktrees, parseWorktreeList } from "./worktrees.mjs";

const SCHEMA_VERSION = 1;
const ID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
// Lead decisions (#759). "defer" is the legacy outcome: it is read as "park" from state.json, and rejected as new input.
const DECISION_OUTCOMES = ["proceed", "proceed-flagged", "park"];
const FLAGGED_LIMIT = 3; // the fourth flagged decision on one issue parks it as needs-refinement
const ENVELOPE_FILE = "envelope.json";
const ENVELOPE_APPROVAL = "envelope-approval.json";
const SIZE_ORDER = ["xs", "s", "m", "l"];
const ROLLBACK_ORDER = ["report-only", "rollback-workflow"];
const INFRA_ORDER = ["none", "listed"];
const PROD_WRITE_ORDER = ["none", "test-data-only"];
const ENVELOPE_DEFAULTS = {
  schemaVersion: SCHEMA_VERSION, mergeToMain: true, migrations: "additive-only", infraChanges: "none", prodDataWrites: "test-data-only",
  deleteOwnTestData: true, seedSyncApply: false, prodReadQueries: true, rollback: "rollback-workflow", closeIssues: true, paidServices: false,
  maxIssues: 8, maxSize: "m", excludeAreas: ["area:auth", "area:infra"],
};
const normalizeOutcome = (o) => (o === "defer" ? "park" : o);
const PHASES = ["not_started", "preflight", "implementing", "integrating", "validating", "release_pr_open", "ci_green", "merged", "deployed", "verified", "done", "done_partial", "blocked_terminal", "cancelled"];
const TERMINAL = new Set(["done", "done_partial", "blocked_terminal", "cancelled"]);
const RELEASE_MODES = ["auto-merge-deploy", "release-pr-only"];
const MIGRATIONS = ["none", "additive-only", "any-reviewed"];
const BLOCKER_KINDS = ["environmental", "dependency", "check-failed", "product-deferred", "source-drift", "limit", "parked"];

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
// The local .qm folder (gitignored). --qm-dir points tests at a temp folder; the default is the main checkout's .qm.
function qmDir() {
  if (typeof opts["qm-dir"] === "string") return path.resolve(String(opts["qm-dir"]));
  return path.join(mainCheckoutRoot(), ".qm");
}
function bundlesDir() {
  if (opts["bundles-dir"]) return path.resolve(String(opts["bundles-dir"]));
  return path.join(qmDir(), "bundles");
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
// ---------- junctions (#762, AC 7.16.4) ----------
// Removes a junction with rmdir, which deletes only the link and never its target. Refuses when anything is still there.
function removeJunction(link) {
  const r = spawnSync("cmd.exe", ["/d", "/s", "/c", `"rmdir "${link}""`], { windowsVerbatimArguments: true, encoding: "utf8" });
  if (r.status !== 0 || fs.existsSync(link) || isLink(link)) die(2, "rmdir did not remove the junction", { stderr: r.stderr });
}
function isLink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } }
/** Path of the git worktree whose folder name is `name`, or null. Read from git, never assumed. */
function worktreePathNamed(name) {
  const out = sh("git", ["worktree", "list", "--porcelain"], true) ?? "";
  for (const line of out.split(/\r?\n/)) {
    if (!line.startsWith("worktree ")) continue;
    const p = line.slice("worktree ".length);
    if (path.basename(p) === name) return p;
  }
  return null;
}
// ---------- delivery profile (#762) ----------
// Every project fact the helper needs lives in one tracked file, read from the checkout that holds this helper.
const PROFILE_PATH = ".claude/delivery-profile.json";
function repoRoot() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."); }
let profileCache = null;
function profile() {
  if (profileCache) return profileCache;
  const file = path.join(repoRoot(), ...PROFILE_PATH.split("/"));
  if (!fs.existsSync(file)) die(2, `Delivery profile missing: ${PROFILE_PATH}`);
  profileCache = readJson(file);
  return profileCache;
}
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
/** Field-named problems with the profile against this checkout. Empty when every named path, workflow and required check exists. */
function profileErrors() {
  const root = repoRoot();
  const pr = profile();
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  const exists = (rel) => typeof rel === "string" && fs.existsSync(path.join(root, ...rel.split("/")));
  req(pr.schemaVersion === 1, "schemaVersion: must be 1");
  req(exists(pr.acFile), `acFile: ${pr.acFile} does not exist`);
  (pr.integratorOnly ?? []).forEach((f, i) => req(exists(f), `integratorOnly[${i}]: ${f} does not exist`));
  req(exists(pr.version?.file), `version.file: ${pr.version?.file} does not exist`);
  (pr.version?.mirrors ?? []).forEach((f, i) => req(exists(f), `version.mirrors[${i}]: ${f} does not exist`));
  for (const [k, wf] of Object.entries(pr.releaseWorkflows ?? {})) req(exists(`.github/workflows/${wf}`), `releaseWorkflows.${k}: .github/workflows/${wf} does not exist`);
  (pr.repo?.requiredChecks ?? []).forEach((c, i) => {
    if (c.external) return;
    const file = path.join(root, ".github", "workflows", String(c.workflow));
    if (!fs.existsSync(file)) { errors.push(`repo.requiredChecks[${i}]: workflow ${c.workflow} does not exist`); return; }
    const jobs = new RegExp(`^  ${escapeRe(c.name)}:`, "m");
    req(jobs.test(fs.readFileSync(file, "utf8")), `repo.requiredChecks[${i}]: job ${c.name} is not in ${c.workflow}`);
  });
  req(exists(pr.checks?.web?.prefix), `checks.web.prefix: ${pr.checks?.web?.prefix} does not exist`);
  req(exists(pr.checks?.api?.root), `checks.api.root: ${pr.checks?.api?.root} does not exist`);
  req(exists(pr.checks?.api?.featuresPrefix), `checks.api.featuresPrefix: ${pr.checks?.api?.featuresPrefix} does not exist`);
  req(exists(pr.worktrees?.webApp), `worktrees.webApp: ${pr.worktrees?.webApp} does not exist`);
  req(exists(pr.checks?.acGate?.script), `checks.acGate.script: ${pr.checks?.acGate?.script} does not exist`);
  return errors;
}
// ---------- related ACs (#740) ----------
function acMarkdown() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = typeof opts["ac-file"] === "string" ? path.resolve(String(opts["ac-file"])) : path.resolve(repoRoot(), profile().acFile);
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
      if (!sliceAc(md, { [arg]: entry }).length) e.push(`${tag}: relatedAcs ${label} '${entry}' does not resolve in ${profile().acFile}`);
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
      if (!lines.length) die(2, `Related AC ${label} '${entry}' no longer resolves in ${profile().acFile}; refine the issue again.`);
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
  // Optional flags the standing envelope checks (#759). Absent means not requested.
  for (const k of ["deleteOwnTestData", "seedSyncApply", "prodReadQueries", "closeIssues"]) req(a[k] === undefined || typeof a[k] === "boolean", `authorization.${k} must be boolean when set`);
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
    req(it?.areas === undefined || (Array.isArray(it.areas) && it.areas.every((x) => /^area:[a-z0-9-]+$/.test(x))), `${tag}: areas must be area:<name> labels when set`);
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

// ---------- standing envelope (#759) ----------
// The most a run may authorise without the owner. Its bytes are approved once (envelope approve); a standing bundle
// approval must then fit inside it field by field.
function validateEnvelope(e) {
  const err = [];
  const req = (cond, msg) => { if (!cond) err.push(msg); };
  if (!e || typeof e !== "object" || Array.isArray(e)) return ["envelope is not an object"];
  req(e.schemaVersion === SCHEMA_VERSION, `schemaVersion must be ${SCHEMA_VERSION}`);
  for (const k of ["mergeToMain", "deleteOwnTestData", "seedSyncApply", "prodReadQueries", "closeIssues"]) req(typeof e[k] === "boolean", `${k} must be boolean`);
  req(MIGRATIONS.includes(e.migrations), `migrations must be one of ${MIGRATIONS.join(", ")}`);
  req(INFRA_ORDER.includes(e.infraChanges), `infraChanges must be one of ${INFRA_ORDER.join(", ")}`);
  req(PROD_WRITE_ORDER.includes(e.prodDataWrites), `prodDataWrites must be one of ${PROD_WRITE_ORDER.join(", ")}`);
  req(ROLLBACK_ORDER.includes(e.rollback), `rollback must be one of ${ROLLBACK_ORDER.join(", ")}`);
  req(e.paidServices === false, "paidServices must be false (enforced)");
  req(Number.isInteger(e.maxIssues) && e.maxIssues > 0, "maxIssues must be a positive integer");
  req(SIZE_ORDER.includes(e.maxSize), `maxSize must be one of ${SIZE_ORDER.join(", ")}`);
  req(Array.isArray(e.excludeAreas) && e.excludeAreas.every((x) => typeof x === "string"), "excludeAreas must be an array of strings");
  return err;
}
/** Fields of the manifest that exceed the envelope. Empty when the bundle fits. An unknown size counts as l; issues without areas cannot prove they avoid excluded areas. */
function envelopeViolations(env, m) {
  const v = [];
  const a = m.authorization ?? {};
  if (a.mergeToMain === true && env.mergeToMain !== true) v.push("mergeToMain: the manifest merges to main; the envelope does not allow it");
  if (MIGRATIONS.indexOf(a.migrations) > MIGRATIONS.indexOf(env.migrations)) v.push(`migrations: manifest ${a.migrations} exceeds envelope ${env.migrations}`);
  if (INFRA_ORDER.indexOf(a.infraChanges) > INFRA_ORDER.indexOf(env.infraChanges)) v.push(`infraChanges: manifest ${a.infraChanges} exceeds envelope ${env.infraChanges}`);
  if (PROD_WRITE_ORDER.indexOf(a.prodDataWrites) > PROD_WRITE_ORDER.indexOf(env.prodDataWrites)) v.push(`prodDataWrites: manifest ${a.prodDataWrites} exceeds envelope ${env.prodDataWrites}`);
  if (a.deleteOwnTestData === true && env.deleteOwnTestData !== true) v.push("deleteOwnTestData: the manifest asks for it; the envelope does not allow it");
  if (a.seedSyncApply === true && env.seedSyncApply !== true) v.push("seedSyncApply: the manifest asks for it; the envelope does not allow it");
  if (a.prodReadQueries === true && env.prodReadQueries !== true) v.push("prodReadQueries: the manifest asks for it; the envelope does not allow it");
  if (a.closeIssues === true && env.closeIssues !== true) v.push("closeIssues: the manifest asks for it; the envelope does not allow it");
  if (ROLLBACK_ORDER.indexOf(a.rollback) > ROLLBACK_ORDER.indexOf(env.rollback)) v.push(`rollback: manifest ${a.rollback} exceeds envelope ${env.rollback}`);
  if (a.paidServices !== false) v.push("paidServices: the manifest must not authorise paid services");
  if (m.issues.length > env.maxIssues) v.push(`maxIssues: ${m.issues.length} issues exceed the envelope limit ${env.maxIssues}`);
  for (const it of m.issues) {
    const size = it.size ?? "l";
    if (SIZE_ORDER.indexOf(size) > SIZE_ORDER.indexOf(env.maxSize)) v.push(`maxSize: #${it.number} is size ${size}; the envelope allows up to ${env.maxSize}`);
    if (env.excludeAreas.length) {
      if (!Array.isArray(it.areas)) v.push(`excludeAreas: #${it.number} has no areas recorded, so it cannot be shown to avoid ${env.excludeAreas.join(", ")}`);
      else for (const x of it.areas.filter((y) => env.excludeAreas.includes(y))) v.push(`excludeAreas: #${it.number} is in ${x}`);
    }
  }
  return v;
}

function loadValidManifest(p, id) {
  if (!fs.existsSync(p.manifest)) die(2, `No manifest for bundle '${id}' at ${p.manifest}. Run qm-bundle-refine first; never substitute another bundle.`);
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
function laneIgnored() { return new Set(profile().integratorOnly.map((g) => normGlob(g))); }
// Path scope (scope.mjs, AC 7.19.31): an issue with no scope.paths uses the areaPaths of its area labels; with neither it is unknown.
const areaPaths = () => profile().areaPaths ?? {};
function planLanes(m, st) {
  const todo = [...m.issues].sort((x, y) => x.order - y.order).filter((i) => !["integrated", "released", "verified", "closed", "deferred", "parked", "skipped_already_done"].includes(st?.issues?.[String(i.number)]?.status));
  const laneOf = new Map();
  const reasons = [];
  const groups = []; // each group is an array of issues that must share a lane
  for (const it of todo) {
    const linked = [];
    for (const g of groups) {
      const why = g.find((o) => {
        if (it.dependsOn.includes(o.number) || o.dependsOn.includes(it.number)) { reasons.push(`#${it.number} and #${o.number}: dependsOn link`); return true; }
        if (it.migration && o.migration) { reasons.push(`#${it.number} and #${o.number}: both migrations`); return true; }
        if (pathsOverlap(effectivePaths(it, areaPaths()).paths, effectivePaths(o, areaPaths()).paths, laneIgnored())) { reasons.push(`#${it.number} and #${o.number}: scope.paths overlap`); return true; }
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
  if (!fs.existsSync(p.approval)) die(2, `Bundle '${id}' is not approved (no approval.json). Approve it in a qm-bundle-refine session.`);
  const ap = readJson(p.approval);
  const hash = sha256File(p.manifest);
  if (ap.status !== "approved") die(2, `Approval status is '${ap.status}', not 'approved'.`);
  if (ap.manifestSha256 !== hash) die(2, "Manifest hash does not match the approved hash; the manifest changed after approval. Re-approve in qm-bundle-refine.", { approvedSha256: ap.manifestSha256, currentSha256: hash });

  const warnings = [];
  const drift = { baseMoved: false, changedFiles: [], overlapping: {}, unknownScope: [] };
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
        const { paths } = effectivePaths(it, areaPaths());
        if (!paths.length) { drift.unknownScope.push(it.number); continue; } // cannot be checked: reported below, never as drift
        const hit = overlappingFiles(paths, drift.changedFiles);
        if (hit.length) drift.overlapping[it.number] = hit;
      }
      if (drift.unknownScope.length) warnings.push(`Issues ${drift.unknownScope.map((n) => `#${n}`).join(", ")} have no scope.paths and no mapped area, so the base change cannot be checked against them. Declare scope.paths, or add an areaPaths entry in .claude/delivery-profile.json.`);
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
  syncRunPhase(path.basename(p.dir), st.phase);
}
// Keeps .qm/autopilot/run.json in step with the bundle phase, so the hooks stop once the phase is terminal (#760).
function syncRunPhase(bundleId, phase) {
  const rf = runFilePath(qmDir());
  const run = readRun(rf);
  if (run && run.bundleId === bundleId) {
    run.phase = phase;
    writeRun(rf, run);
  }
}
// Starts (or re-points) the run file for the session that holds the bundle lock (#760).
function startRun(bundleId, holder, phase) {
  writeRun(runFilePath(qmDir()), { bundleId, session: holder, phase, stopBlocks: 0, stalled: false, lastStateHash: null });
}
// Standing approval without an approved envelope ends the run here (#760 AC 7): one instruction line, phase blocked_terminal.
function failStandingNoEnvelope(bundleId) {
  const line = "No approved standing envelope. The owner runs once: node scripts/bundle/bundle.mjs envelope init, then envelope approve (with the owner's own reply).";
  const rf = runFilePath(qmDir());
  const existing = readRun(rf);
  // Another bundle's live run is not this command's to change: only this bundle's run file is ended here.
  if (!existing || existing.bundleId === bundleId) {
    const run = existing ?? { bundleId, session: holderId() ?? null, stopBlocks: 0, stalled: false };
    run.phase = "blocked_terminal";
    run.reason = line;
    writeRun(rf, run);
  }
  die(2, line);
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
  const pr = profile().checks;
  const norm = paths.map((x) => x.replaceAll(String.fromCharCode(92), "/"));
  const has = (pre) => norm.filter((x) => x.startsWith(pre));
  const out = [];
  const web = has(pr.web.prefix).map((x) => x.replace(/\/\*\*.*$/, ""));
  if (web.length) for (const c of pr.web.commands) out.push(c.replaceAll("{paths}", web.join(" ")));
  const depth = pr.api.featuresPrefix.split("/").filter(Boolean).length;
  const feats = new Set(has(pr.api.featuresPrefix).map((x) => x.split("/")[depth]).filter((x) => x && !/[*?]/.test(x)));
  if (feats.size) out.push(pr.api.featureCommand.replaceAll("{features}", [...feats].map((f) => pr.api.featureTerm.replaceAll("{feature}", f)).join("|")));
  else if (has(pr.api.root).length) out.push(pr.api.fallbackCommand);
  if (pr.scripts.prefixes.some((pre) => has(pre).length)) out.push(pr.scripts.command);
  out.push(pr.acGate.command.replaceAll("{issue}", String(issue)));
  for (const v of extra ?? []) if (!out.includes(v)) out.push(v);
  return out;
}
function acSliceFor(issue) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(here, "..", "validation", "ac-slice.mjs");
  const args = [script, "--issue", String(issue), "--max-lines", "80"];
  if (typeof opts["ac-file"] === "string") args.push("--file", path.resolve(String(opts["ac-file"])));
  return sh("node", args, true) ?? `(no ACs in ${profile().acFile} carry (#${issue}) yet)`;
}
function renderPacket(p) {
  const L = [`# Work packet: #${p.issue} ${p.title}`, "", `attempt: ${p.attempt} of ${p.maxAttempts}`, `facts (${p.factSource}): size ${p.size}, risk ${p.risk}${p.riskSource ? ` (${p.riskSource})` : ""}, migration ${p.migration}${p.migrationSource ? ` (${p.migrationSource})` : ""}`, ...(p.classification ? [`classification: ${p.classification}`] : []), "", "## Goal", p.goal, ""];
  L.push("## Models by role (dispatch each agent with its role's model)", ...Object.entries(p.models).map(([r, m]) => `- ${r}: ${m.model}. Why: ${m.reason}`), "");
  L.push("## Acceptance criteria", ...p.acs.map((a) => `- ${a.id} [verify: ${a.evidence}] ${a.text}`), "");
  L.push("## Exclusions", ...(p.exclusions.length ? p.exclusions.map((x) => `- ${x}`) : ["- (none)"]), "");
  L.push("## scope.paths", ...(p.paths.length ? p.paths.map((x) => `- ${x}`) : ["- (unknown: none declared; find files by Grep and say what you checked)"]), "");
  L.push("## dependsOn", p.dependsOn.length ? p.dependsOn.map((d) => (typeof d === "number" ? `#${d}` : d.external)).join(", ") : "(none)", "");
  L.push("## Checks to run (filtered only)", ...p.checks.map((c) => `- \`${c}\``), "");
  L.push(`## Related ACs (from ${profile().acFile}; do not open the whole file)`, "```", ...p.related, "```", "");
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
  const api = p.paths.some((x) => x.replaceAll(String.fromCharCode(92), "/").startsWith(`${profile().checks.api.root}/`));
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
// Read-only roles plan or review and write no files. They may finish "done" with an empty acEvidence, but only with
// no filesChanged and an existing deliverable file. The role comes from the orchestrator, and the specialist has
// read-only permissions. A git-status check would only show that the shared worktree is dirty, not which agent
// changed it, so it is not used (AC 7.13.4).
const PLANNING_ROLES = new Set(["architect", "reviewer", "ux-designer", "qm-lead"]);
function isPlanningDone(h, role) {
  return PLANNING_ROLES.has(role) && h.status === "done" && Array.isArray(h.filesChanged) && h.filesChanged.length === 0
    && typeof h.deliverable === "string" && h.deliverable.length > 0;
}
function validateHandback(h, role = "") {
  const e = [];
  if (!h || typeof h !== "object" || Array.isArray(h)) return ["handback must be a JSON object"];
  if (h.deliverable !== undefined && typeof h.deliverable !== "string") e.push("deliverable must be a file path");
  if (!["done", "failed", "blocked"].includes(h.status)) e.push("status must be done, failed or blocked");
  if (!Array.isArray(h.filesChanged) || h.filesChanged.some((x) => typeof x !== "string")) e.push("filesChanged must be an array of strings");
  if (!Array.isArray(h.commands) || h.commands.some((c) => !c || typeof c.command !== "string" || !Number.isInteger(c.exitCode))) e.push("commands must be an array of { command, exitCode }");
  if (!h.acEvidence || typeof h.acEvidence !== "object" || Array.isArray(h.acEvidence) || Object.values(h.acEvidence).some((v) => typeof v !== "string")) e.push("acEvidence must be an object of AC id to file path");
  else if (h.status === "done" && !Object.keys(h.acEvidence).length && !isPlanningDone(h, role)) {
    e.push(PLANNING_ROLES.has(role)
      ? "a planning or review done handback needs filesChanged [] and a deliverable path, or acEvidence naming at least one AC"
      : "acEvidence must name at least one AC when status is done");
  }
  if (!Array.isArray(h.questions)) e.push("questions must be an array");
  if (h.acRefsAdded !== undefined && (!Array.isArray(h.acRefsAdded) || h.acRefsAdded.some((x) => typeof x !== "string"))) e.push("acRefsAdded must be an array of strings");
  if (h.status === "done" && Array.isArray(h.commands) && h.commands.some((c) => c && Number.isInteger(c.exitCode) && c.exitCode !== 0)) e.push("a done handback cannot include a command with a nonzero exitCode");
  return e;
}

// ---------- standing approval and envelope (#759) ----------
function approvedEnvelope(ep, eap) {
  const ea = safeJson(eap);
  return Boolean(ea && ea.status === "approved" && ea.envelopeSha256 === sha256File(ep));
}
/** Checks a standing approval and returns the approval fields to write. Every failure exits 2 with the reason. */
function standingApproval(p, m, hash) {
  const ep = path.join(qmDir(), ENVELOPE_FILE);
  const eap = path.join(qmDir(), ENVELOPE_APPROVAL);
  if (!fs.existsSync(ep) || !fs.existsSync(eap)) failStandingNoEnvelope(m.bundleId ?? path.basename(p.dir));
  const env = readJson(ep);
  const envErrors = validateEnvelope(env);
  if (envErrors.length) die(2, "Envelope is invalid", { errors: envErrors });
  const ea = readJson(eap);
  if (ea.status !== "approved") die(2, `Envelope approval status is '${ea.status}', not 'approved'.`);
  const envHash = sha256File(ep);
  if (ea.envelopeSha256 !== envHash) die(2, "The envelope changed after the owner approved it; the owner must approve the new bytes.", { approvedSha256: ea.envelopeSha256, currentSha256: envHash });
  const violations = envelopeViolations(env, m);
  if (violations.length) die(2, "Manifest exceeds the standing envelope. Remove the offending issues or ask the owner for a user approval.", { violations });
  const review = safeJson(path.join(p.dir, "review.json"));
  if (!review || !Array.isArray(review.openFindings)) die(2, "No manifest review record. Refine step 8 writes review.json with openFindings.");
  if (review.openFindings.length) die(2, `The manifest review has ${review.openFindings.length} open finding(s); a standing approval needs none.`);
  if (typeof opts["lead-decision"] !== "string") die(1, "--lead-decision <file> is required: the qm-lead decision JSON for this approval");
  const decisionFile = path.resolve(String(opts["lead-decision"]));
  const d = readJson(decisionFile);
  if (d.outcome !== "proceed" || d.acImpact === "weakens") die(2, "The lead decision must be proceed (not park, and not weakens) to approve standing.");
  return {
    kind: "standing", approvedBy: `standing envelope ${envHash.slice(0, 12)}`, envelopeSha256: envHash,
    leadDecision: { id: d.id ?? sha256File(decisionFile).slice(0, 16), outcome: d.outcome },
  };
}

// ---------- decisions and precedents (#759) ----------
/** Park or flag counts for the status report. Legacy "defer" entries count as parked. */
function decisionsByOutcome(st) {
  const out = { flagged: [], parked: [] };
  for (const d of st.decisions ?? []) {
    const applied = normalizeOutcome(d.appliedOutcome ?? d.outcome);
    if (applied === "proceed-flagged") out.flagged.push(d);
    else if (applied === "park") out.parked.push(d);
  }
  return out;
}
const PRECEDENT_SCOPES = ["issue", "area", "global"];
function precedentFile() { return path.join(qmDir(), "lead", "precedents.jsonl"); }
function readPrecedents() {
  if (!fs.existsSync(precedentFile())) return [];
  return fs.readFileSync(precedentFile(), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
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
    const m = loadValidManifest(p, id);
    const methods = [...profile().acceptanceMethods, "none"];
    const bad = m.issues.flatMap((it) => it.acceptanceCriteria.filter((ac) => !methods.includes(ac.evidence)).map((ac) => `#${it.number} ${ac.id}: evidence '${ac.evidence}' is not a profile method or none`));
    if (bad.length) die(2, "Acceptance evidence must be a profile method or none", { errors: bad });
    ok({ bundleId: id, manifestSha256: sha256File(p.manifest), valid: true });
  }
  case "profile": {
    // profile check: exits 2 naming the field that does not match this checkout, 0 when it matches
    if (positional[0] !== "check") die(1, "usage: bundle.mjs profile check");
    const errors = profileErrors();
    if (errors.length) die(2, "Delivery profile does not match this checkout", { errors });
    ok({ profile: PROFILE_PATH, checked: true });
  }
  case "junction": {
    // junction <laneA|laneB|release> [--remove]: builds the Windows junction from runtime paths (AC 7.16.4, #762).
    // The main checkout comes from git, the lane from `git worktree list`, the web app from the profile. Never a recursive delete.
    const lane = positional[0];
    if (!lane || !profile().worktrees[lane] || !["laneA", "laneB", "release"].includes(lane)) die(1, "usage: bundle.mjs junction <laneA|laneB|release> [--remove]");
    if (process.platform !== "win32") die(2, "junctions are created on Windows only");
    const webApp = profile().worktrees.webApp;
    const lanePath = worktreePathNamed(profile().worktrees[lane]);
    if (!lanePath) die(2, `No git worktree named ${profile().worktrees[lane]}; create it first (git worktree add).`);
    const mainRoot = mainCheckoutRoot();
    const link = path.join(lanePath, webApp, "node_modules");
    const target = path.join(mainRoot, webApp, "node_modules");
    const command = `mklink /J "${link}" "${target}"`;
    if (opts.remove) {
      if (!fs.existsSync(link) && !isLink(link)) die(2, `Nothing to remove at ${link}`);
      if (!isLink(link)) die(2, `Refusing to remove ${link}: it is not a junction. Never use a recursive delete.`);
      removeJunction(link);
      ok({ removed: link, target: "untouched" });
    }
    if (!fs.existsSync(target)) die(2, `Junction target is missing: ${target}`);
    // A dangling junction (its target folder is gone) is repaired: only the link is removed, never the target (AC 7.19.33).
    if (isLink(link) && !fs.existsSync(link)) removeJunction(link);
    if (fs.existsSync(link) || isLink(link)) die(2, `${link} already exists; not replaced.`);
    const r = spawnSync("cmd.exe", ["/d", "/s", "/c", `"mklink /J "${link}" "${target}""`], { windowsVerbatimArguments: true, encoding: "utf8" });
    if (r.status !== 0 || !isLink(link)) die(2, "mklink /J failed", { stderr: r.stderr });
    ok({ link, target, command });
  }
  case "mutex": {
    // mutex <dotnet|release-merge> --acquire|--release [--holder <token>]: one heavy command at a time across lanes (AC 7.19.32).
    const name = positional[0];
    const usage = `usage: bundle.mjs mutex <${MUTEX_NAMES.join("|")}> --acquire|--release [--holder <token>]`;
    if (!MUTEX_NAMES.includes(name) || Boolean(opts.acquire) === Boolean(opts.release)) die(1, usage);
    const holder = holderId();
    if (!holder) die(1, "mutex needs --holder <token> (or CLAUDE_CODE_SESSION_ID)");
    if (opts.acquire) {
      const r = acquireMutex({ qmDir: qmDir(), name, holder });
      if (!r.acquired) die(4, `Mutex '${name}' is held by ${r.holder.holder} (heartbeat ${r.holder.heartbeatAt}). Wait and retry; a lock with no heartbeat for ${MUTEX_STALE_MINUTES} minutes is taken over.`, { holder: r.holder });
      ok({ mutex: name, acquired: true, takenOver: r.takenOver });
    }
    const r = releaseMutex({ qmDir: qmDir(), name, holder });
    if (!r.released) die(2, r.reason);
    ok({ mutex: name, released: true });
  }
  case "worktrees": {
    // worktrees --ensure <bundle id>: creates the lane and release worktrees the profile names, creates release/<id> from
    // origin/main when missing, then builds each junction (AC 7.19.33). A worktree on another branch is refused, never switched.
    if (typeof opts.ensure !== "string") die(1, "usage: bundle.mjs worktrees --ensure <bundle id>");
    const id = opts.ensure;
    bundlePaths(id); // validates the id
    const names = profile().worktrees;
    const releaseBranch = `release/${id}`;
    if (sh("git", ["rev-parse", "--verify", "--quiet", "origin/main"], true) === null) die(2, "origin/main is not present; run git fetch origin main first");
    const existing = parseWorktreeList(sh("git", ["worktree", "list", "--porcelain"], true) ?? "");
    const releaseBranchExists = sh("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${releaseBranch}`], true) !== null;
    const plan = planWorktrees({ names, existing, releaseBranch, releaseBranchExists });
    if (plan.refusals.length) die(2, plan.refusals.join("; "), { refusals: plan.refusals });
    const root = mainCheckoutRoot();
    const created = [];
    for (const a of plan.actions) {
      const folder = path.join(path.dirname(root), a.name);
      const r = spawnSync("git", ["worktree", "add", ...a.args.map((x) => (x === "{path}" ? folder : x))], { cwd: root, encoding: "utf8" });
      if (r.status !== 0) die(2, `git worktree add failed for ${a.name}`, { stderr: (r.stderr ?? "").trim() });
      created.push({ lane: a.lane, path: folder });
    }
    const junctions = ["laneA", "laneB", "release"].map((lane) => {
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "junction", lane], { cwd: root, encoding: "utf8" });
      return { lane, ok: r.status === 0, detail: (r.stdout || r.stderr || "").trim().slice(0, 300) };
    });
    ok({ bundleId: id, releaseBranch, created, junctions });
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
    const m = loadValidManifest(p, id);
    const hash = sha256File(p.manifest);
    const given = String(opts.hash ?? "");
    if (given.length < 8 || !hash.startsWith(given.toLowerCase())) die(2, "Hash given by the user does not match the current manifest. Show the new hash and ask again.", { currentSha256: hash });
    let approval;
    if (opts.standing === true) {
      // Standing approval (#759): no user reply. The manifest must fit the owner-approved envelope, with a clean review and a lead proceed.
      approval = standingApproval(p, m, hash);
    } else {
      const check = checkUserReply({ reply: opts["user-reply"], given });
      if (!check.ok) die(check.reason.startsWith("--user-reply") ? 1 : 2, check.reason);
      approval = {
        approvedBy: check.kind === "start-autopilot" ? "user, start autopilot" : "user, in the qm-bundle-refine session",
        userReply: opts["user-reply"],
      };
    }
    const prev = fs.existsSync(p.approval) ? readJson(p.approval) : null;
    if (fs.existsSync(p.state)) die(2, "Execution already started for this bundle; create a new bundle id instead of re-approving a running one.");
    const history = prev ? [...(prev.history ?? []), { manifestSha256: prev.manifestSha256, approvedAt: prev.approvedAt, supersededAt: now() }] : [];
    writeJsonAtomic(p.approval, { schemaVersion: SCHEMA_VERSION, bundleId: id, status: "approved", manifestSha256: hash, approvedAt: now(), ...approval, history });
    ok({ bundleId: id, manifestSha256: hash, approved: true, kind: opts.standing === true ? "standing" : "user" });
  }
  case "envelope": {
    // envelope init | show | approve --hash <prefix> --user-reply "<text containing approve <prefix>>"
    const sub = positional[0];
    const ep = path.join(qmDir(), ENVELOPE_FILE);
    const eap = path.join(qmDir(), ENVELOPE_APPROVAL);
    if (sub === "init") {
      if (fs.existsSync(ep)) die(2, `${ep} already exists; refusing to overwrite the envelope.`);
      fs.mkdirSync(qmDir(), { recursive: true });
      writeJsonAtomic(ep, ENVELOPE_DEFAULTS);
      ok({ envelope: ep, sha256: sha256File(ep), note: "Show the owner this file, then approve its hash: envelope approve --hash <prefix>." });
    }
    if (!fs.existsSync(ep)) die(2, `No envelope at ${ep}. Run: envelope init.`);
    const envHash = sha256File(ep);
    const env = readJson(ep);
    const envErrors = validateEnvelope(env);
    if (sub === "show") {
      if (envErrors.length) die(2, "Envelope is invalid", { errors: envErrors });
      ok({ envelope: env, sha256: envHash, approved: approvedEnvelope(ep, eap) });
    }
    if (sub === "approve") {
      if (envErrors.length) die(2, "Envelope is invalid", { errors: envErrors });
      const given = String(opts.hash ?? "");
      if (given.length < 8 || !envHash.startsWith(given.toLowerCase())) die(2, "Hash given does not match the current envelope. Show the owner the envelope again.", { currentSha256: envHash });
      const reply = opts["user-reply"];
      if (typeof reply !== "string" || !reply.trim()) die(1, "--user-reply \"<verbatim owner approval text>\" is required");
      const replyHash = (reply.match(/\bapprove\s+([0-9a-f]{8,64})\b/i) ?? [])[1];
      if (!replyHash || replyHash.toLowerCase() !== given.toLowerCase()) die(2, "The owner's reply must contain 'approve <hash prefix>' matching --hash.");
      writeJsonAtomic(eap, { schemaVersion: SCHEMA_VERSION, status: "approved", envelopeSha256: envHash, approvedAt: now(), userReply: reply, history: [] });
      ok({ envelope: ep, sha256: envHash, approved: true });
    }
    die(1, "Usage: envelope init | show | approve --hash <prefix> --user-reply \"<text>\"");
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
    // Records the bytes the owner was shown, so a typed "start autopilot" (start-hook.mjs, AC 7.19.29) approves only these.
    writeJsonAtomic(path.join(p.dir, "brief.json"), { schemaVersion: SCHEMA_VERSION, bundleId: id, manifestSha256: hash, shownAt: now() });
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
      else if (TERMINAL.has(st.phase)) die(2, `Bundle is in terminal phase '${st.phase}'. ${st.phase === "blocked_terminal" ? "Fix the blocker, then run: /qm-bundle-ship " + id + " resume" : "Nothing to resume."}`, { phase: st.phase });
      const foreign = st.lock && st.lock.holder !== holder && !lockIsStale(st.lock, m.limits.lockStaleMinutes);
      if (foreign && !opts["take-over"]) die(4, `Bundle is locked by another session (${st.lock.holder}), heartbeat ${st.lock.heartbeatAt}. If that session is gone, the user can run: /qm-bundle-ship ${id} resume`);
      const previousHolder = st.lock?.holder ?? null;
      st.lock = { holder, acquiredAt: now(), heartbeatAt: now() };
      st.resumeCount = (st.resumeCount ?? 0) + 1;
      st.clockStart = now();
      saveState(p, st, { event: reopened ? "reopened" : foreign ? "taken-over" : "resumed", holder, previousHolder });
      startRun(id, holder, st.phase);
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
    startRun(id, holder, st.phase);
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
    const badMove = transitionError(it.status, status);
    if (badMove) die(2, badMove, { issue: Number(num), from: it.status, to: status });
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
    if (phase === "release_pr_open") {
      // One release at a time (design A, F3): a second bundle may not open its release PR while another one holds the slot.
      const holder = releaseSlotHolder(bundlesDir(), id);
      if (holder) die(2, `Release slot is held by bundle '${holder.bundleId}' (phase ${holder.phase}). Wait until it is verified, done or blocked_terminal.`, { holder });
    }
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
    if (vals.some((i) => ["pending", "in_progress", "implemented"].includes(i.status))) errs.push("some issues are still in progress; finish or defer them first");
    if (vals.some((i) => i.status === "validated")) errs.push("some issues are validated but not integrated; integrate them into the release branch first");
    const holder = releaseSlotHolder(bundlesDir(), id);
    if (holder) errs.push(`release slot is held by bundle '${holder.bundleId}' (phase ${holder.phase})`);
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
    if (opts.resolve !== undefined) {
      // Resolving keeps the record as history; status shows only open blockers (AC 7.19.27).
      const index = typeof opts.resolve === "string" ? Number(opts.resolve) : NaN;
      const r = resolveBlocker(st.blockers, index, opts.note, now());
      if (r.error) die(r.resolvedAt ? 2 : 1, r.error, r.resolvedAt ? { resolvedAt: r.resolvedAt } : {});
      st.blockers = r.blockers;
      saveState(p, st, { event: "blocker-resolved", index });
      ok({ bundleId: id, resolved: index, open: openBlockers(st.blockers).length });
    }
    const kind = String(opts.kind ?? "");
    if (!BLOCKER_KINDS.includes(kind)) die(1, `--kind must be one of ${BLOCKER_KINDS.join(", ")}`);
    if (typeof opts.note !== "string") die(1, "--note is required (factual description, no secrets)");
    const issue = opts.issue ? String(opts.issue) : null;
    if (issue && !st.issues[issue]) die(2, `Issue #${issue} is not in bundle '${id}'.`);
    st.blockers.push({ at: now(), kind, issue: issue ? Number(issue) : null, note: opts.note });
    saveState(p, st, { event: "blocker", kind, issue });
    ok({ bundleId: id, blockers: openBlockers(st.blockers).length });
  }
  case "decision": {
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    if (typeof opts.file !== "string") die(1, "--file <decision.json> required (the qm-lead result, saved verbatim)");
    const d = readJson(path.resolve(opts.file));
    const need = ["question", "decision", "rationale", "acImpact", "validationRequired", "outcome"];
    const missing = need.filter((k) => !(k in d));
    if (missing.length) die(1, `decision missing fields: ${missing.join(", ")}`);
    if (!DECISION_OUTCOMES.includes(d.outcome)) die(1, `decision.outcome must be one of ${DECISION_OUTCOMES.join(", ")}`);
    if (!["none", "clarifies", "weakens"].includes(d.acImpact)) die(1, "decision.acImpact must be none, clarifies or weakens");
    const parkReason = d.parkReason ?? d.deferReason;
    if (d.outcome === "park" && !parkReason) die(1, "decision.parkReason is required when outcome is park");
    const issue = opts.issue ? String(opts.issue) : null;
    if (issue && !st.issues[issue]) die(2, `Issue #${issue} is not in bundle '${id}'.`);
    // Applied outcome: weakened ACs never proceed; a fourth flagged decision on one issue parks it as needs-refinement.
    let outcome = d.outcome;
    let reason = parkReason;
    let reasonCode = null;
    if (d.acImpact === "weakens") { outcome = "park"; reason ??= "the only option would weaken an acceptance criterion"; }
    if (outcome === "proceed-flagged" && issue) {
      const flagged = decisionsByOutcome(st).flagged.filter((x) => String(x.issue) === issue).length;
      if (flagged >= FLAGGED_LIMIT) { outcome = "park"; reasonCode = "needs-refinement"; reason = `needs-refinement: more than ${FLAGGED_LIMIT} flagged decisions on this issue; refine the issue instead of guessing again`; }
    }
    const decisionId = `d-${randomBytes(4).toString("hex")}`;
    st.decisions.push({ ...d, id: decisionId, at: now(), issue: issue ? Number(issue) : null, appliedOutcome: outcome, ...(reasonCode ? { reasonCode } : {}) });
    if (outcome === "park" && issue) {
      st.issues[issue].status = "parked";
      if (reasonCode) st.issues[issue].parkReason = reasonCode;
      st.issues[issue].notes.push(`${now()} parked by decision ${decisionId}: ${reason}`);
      st.blockers.push({ at: now(), kind: "parked", issue: Number(issue), note: reason });
    }
    saveState(p, st, { event: "decision", issue, outcome, id: decisionId });
    if (d.acImpact === "weakens") die(2, "A decision may not weaken acceptance criteria; recorded as park.", { id: decisionId, appliedOutcome: outcome });
    ok({ bundleId: id, id: decisionId, decisions: st.decisions.length, outcome, ...(reasonCode ? { reasonCode } : {}) });
  }
  case "precedent": {
    // precedent add --question "..." --answer "..." --scope issue|area|global [--issue n] [--area area:x] [--source owner]
    // precedent find [--issue n] [--area area:x]   (returns global precedents plus those matching the issue or area)
    const sub = positional[0];
    if (sub === "add") {
      const q = opts.question, a = opts.answer, scope = opts.scope;
      if (typeof q !== "string" || !q.trim() || typeof a !== "string" || !a.trim()) die(1, "precedent add needs --question and --answer");
      if (!PRECEDENT_SCOPES.includes(scope)) die(1, `--scope must be one of ${PRECEDENT_SCOPES.join(", ")}`);
      const rec = { id: `p-${randomBytes(4).toString("hex")}`, question: q.trim(), answer: a.trim(), scope, date: now().slice(0, 10), source: typeof opts.source === "string" ? opts.source : "owner" };
      if (scope === "issue") {
        const n = Number(opts.issue);
        if (!Number.isInteger(n) || n <= 0) die(1, "--issue <n> is required for issue scope");
        rec.issue = n;
      }
      if (scope === "area") {
        if (typeof opts.area !== "string" || !/^area:[a-z0-9-]+$/.test(opts.area)) die(1, "--area area:<name> is required for area scope");
        rec.area = opts.area;
      }
      fs.mkdirSync(path.dirname(precedentFile()), { recursive: true });
      fs.appendFileSync(precedentFile(), JSON.stringify(rec) + "\n", "utf8");
      ok({ precedent: rec.id, scope, file: precedentFile() });
    }
    if (sub === "find") {
      const issue = opts.issue === undefined ? null : String(opts.issue);
      const area = typeof opts.area === "string" ? opts.area : null;
      const hits = readPrecedents().filter((r) => r.scope === "global"
        || (r.scope === "issue" && issue !== null && String(r.issue) === issue)
        || (r.scope === "area" && area !== null && r.area === area));
      ok({ matches: hits.length, precedents: hits });
    }
    die(1, "Usage: precedent add --question <q> --answer <a> --scope issue|area|global [--issue n] [--area area:x] | precedent find [--issue n] [--area area:x]");
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
    const open = openBlockers(st?.blockers ?? []);
    if (open.length) { lines.push("Blockers (open; resolve with blocker --resolve <index>):"); for (const b of open) lines.push(`  [${b.index}] [${b.kind}]${b.issue ? ` #${b.issue}` : ""} ${b.note}`); }
    if (st?.lock) lines.push(`Lock: ${st.lock.holder}, heartbeat ${st.lock.heartbeatAt}`);
    // A stalled run stops the hooks (AC 7.19.22). Show it here so it is not silent.
    const runFile = readRun(runFilePath(qmDir()));
    if (runFile && runFile.bundleId === id && runFile.stalled) lines.push(`Run: stalled after ${STALL_AFTER_BLOCKS} blocks with no progress; the hooks have stopped. Resume the run or cancel it.`);
    if (st) {
      // Flagged decisions ship and are listed for review; parked questions wait for the owner. Legacy "defer" counts as parked.
      const by = decisionsByOutcome(st);
      lines.push(`Flagged decisions (${by.flagged.length}):`);
      for (const d of by.flagged) lines.push(`  ${d.issue ? `#${d.issue}` : "global"} ${d.question}: ${d.decision}`);
      lines.push(`Parked questions (${by.parked.length}):`);
      for (const d of by.parked) lines.push(`  ${d.issue ? `#${d.issue}` : "global"} ${d.question} (${d.parkReason ?? d.deferReason ?? "no reason recorded"})`);
    }
    process.stdout.write(lines.join("\n") + "\n");
    process.exit(0);
  }
  case "validation": {
    // The validator's record of one issue's production check (design D.5, E). It writes state only: labels, comments
    // and closing are the validator's own gh calls. A pass moves the issue to verified; close it next with `issue`.
    const p = bundlePaths(id);
    const m = loadValidManifest(p, id);
    const st = loadState(p);
    requireHolder(st, m);
    if (!["deployed", "validating"].includes(st.phase)) die(2, `validation needs phase deployed or validating, not '${st.phase}'.`);
    const num = String(opts.issue ?? "");
    if (!st.issues[num]) die(2, `Issue #${num} is not in bundle '${id}'.`);
    const it = st.issues[num];
    if (it.status !== "released") die(2, `Issue #${num} is '${it.status}'; only released issues are validated.`);
    const result = opts.result;
    if (result !== "pass" && result !== "fail") die(1, "--result must be pass or fail");
    const fixCycle = opts["fix-cycle"] === undefined ? 0 : Number(opts["fix-cycle"]);
    if (!Number.isInteger(fixCycle) || fixCycle < 0) die(1, "--fix-cycle must be a whole number, 0 or more");
    if (typeof opts.evidence !== "string" || !opts.evidence.trim()) die(1, "--evidence <url> is required (the posted evidence comment)");
    let kind = null;
    let outcome = "closable";
    if (result === "fail") {
      kind = String(opts.kind ?? "");
      if (!VALIDATION_KINDS.includes(kind)) die(1, `--kind must be one of ${VALIDATION_KINDS.join(", ")}`);
      outcome = validationOutcome(kind, fixCycle);
    }
    const next = result === "pass" ? "verified" : "validation_failed";
    const badMove = transitionError(it.status, next);
    if (badMove) die(2, badMove, { issue: Number(num) });
    it.status = next;
    it.validation = { result, kind, fixCycle, outcome, evidence: opts.evidence, at: now() };
    saveState(p, st, { event: "validation", issue: Number(num), result, kind, outcome });
    ok({ bundleId: id, issue: Number(num), status: next, outcome, fixCycle });
  }
  case "select": {
    // Picks the next batch from the open status:ready issues (design B). Read-only: writes nothing and approves nothing.
    // Input: --issues-file <json array> (a saved gh issue list, optionally with paths, dependsOn, migration), or gh when omitted.
    let raw;
    if (typeof opts["issues-file"] === "string") raw = readJson(path.resolve(String(opts["issues-file"])));
    else {
      const repo = originNameWithOwner();
      if (!repo) die(2, "Cannot read the origin repo; pass --issues-file with a saved list.");
      const out = sh("gh", ["issue", "list", "--repo", repo, "--state", "open", "--label", "status:ready", "--limit", "200", "--json", "number,title,labels,body"], true);
      if (!out) die(2, "gh issue list failed (environmental); pass --issues-file with a saved list.");
      raw = JSON.parse(out);
    }
    if (!Array.isArray(raw)) die(1, "the issues list must be a JSON array");
    const candidates = raw.map((c) => ({
      number: Number(c.number),
      title: c.title,
      labels: c.labels,
      hasAcs: typeof c.hasAcs === "boolean" ? c.hasAcs : /acceptance criteria/i.test(c.body ?? ""),
      paths: Array.isArray(c.paths) ? c.paths : [],
      dependsOn: Array.isArray(c.dependsOn) ? c.dependsOn.map(Number) : [],
      migration: Boolean(c.migration),
    }));
    const maxIssues = opts.max === undefined ? 8 : Number(opts.max);
    if (!Number.isInteger(maxIssues) || maxIssues < 1) die(1, "--max must be a whole number, 1 or more");
    const maxSize = String(opts["max-size"] ?? "m");
    const excludeAreas = String(opts["exclude-areas"] ?? "auth,infra").split(",").map((a) => a.trim()).filter(Boolean).map((a) => `area:${a}`);
    const locked = lockedIssues(bundlesDir());
    ok({ ...selectIssues(candidates, { maxIssues, maxSize, excludeAreas, locked }), lockedByRunningBundles: [...locked].sort((a, b) => a - b) });
  }
  case "permissions": {
    // Prints the allow rules a run needs, taken from the ship skill's allowed-tools list (#760 AC 5). Prints only; never writes settings.
    const skill = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "skills", "qm-bundle-ship", "SKILL.md");
    const text = fs.existsSync(skill) ? fs.readFileSync(skill, "utf8").replace(/\r\n/g, "\n") : "";
    const fm = (text.match(/^---\n([\s\S]*?)\n---/) ?? [])[1] ?? "";
    const rules = [];
    let inList = false;
    for (const line of fm.split("\n")) {
      if (/^allowed-tools:\s*$/.test(line)) { inList = true; continue; }
      if (inList && /^\s+-\s+/.test(line)) rules.push(line.replace(/^\s+-\s+/, "").trim());
      else if (inList && line.trim() !== "") inList = false;
    }
    if (rules.length === 0) die(2, "No allowed-tools found in the ship skill; nothing to print.");
    ok({ source: ".claude/skills/qm-bundle-ship/SKILL.md", allow: rules });
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
    const tpl = path.join(repoRoot(), ".claude", "skills", "qm-bundle-refine", "templates", "manifest.template.json");
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
    const errors = validateHandback(h, typeof opts.role === "string" ? opts.role : "");
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
    const errors = validateHandback(h, role);
    const root = path.resolve(typeof opts["repo-root"] === "string" ? opts["repo-root"] : ".");
    if (h && typeof h.acEvidence === "object" && h.acEvidence) for (const [ac, f] of Object.entries(h.acEvidence)) if (typeof f === "string" && !fs.existsSync(path.resolve(root, f))) errors.push(`acEvidence ${ac} points to a missing file: ${f}`);
    // A planning claim with no acEvidence must name a deliverable that exists. The role is set by the orchestrator, so the
    // other checks (no filesChanged, no failing command) are the guard against a coder or tester using the planning rule.
    if (h && isPlanningDone(h, role) && !fs.existsSync(path.resolve(root, h.deliverable))) errors.push(`planning deliverable is missing: ${h.deliverable}`);
    if (errors.length) die(2, "Handback is invalid", { errors });
    const dir = typeof opts["handbacks-dir"] === "string" ? path.resolve(String(opts["handbacks-dir"])) : path.join(mainCheckoutRoot(), ".qm", "handbacks");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${issue}-${role}.json`);
    // Dispatch record (AC 7.13.3): the model this role ran on and why, copied from its packet line.
    const packetsDir = typeof opts["packets-dir"] === "string" ? path.resolve(String(opts["packets-dir"])) : path.join(mainCheckoutRoot(), ".qm", "packets");
    const packetFile = path.join(packetsDir, `${issue}.md`);
    // The role comes from the command line: escape it so it matches literally (CodeQL js/regex-injection).
    const roleRe = String(role).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const line = fs.existsSync(packetFile) ? new RegExp(`^- ${roleRe}: (\\w+)\\. Why: (.+)$`, "m").exec(fs.readFileSync(packetFile, "utf8")) : null;
    const dispatch = line ? { role, issue, model: line[1], reason: line[2].trim() } : { role, issue, model: null, reason: "no packet line for this role" };
    writeJsonAtomic(file, { ...h, issue, role, claimed: true, dispatch, savedAt: new Date().toISOString() });
    ok({ saved: file, status: h.status, claimed: true, note: "Recorded as the agent's claim. Verification is the AC gate and CI." });
  }
  default:
    process.stdout.write(`Usage: node bundle.mjs <command> <bundleId> [options]
Refine:  new, snapshot <n...>, check, hash, brief (text), approve --hash <prefix> --user-reply "<text containing approve <prefix>>"
         approve --hash <prefix> --standing --lead-decision <file>   (inside the owner's standing envelope; no user reply)
Envelope: envelope init | show | approve --hash <prefix> --user-reply "<text containing approve <prefix>>"
Lead:    precedent add --question q --answer a --scope issue|area|global [--issue n] [--area area:x]; precedent find [--issue n] [--area area:x]
Execute: verify [--gh] [--no-git], state-init [--take-over] (prints holder), then with --holder <h>:
         checkpoint, issue <n> <status> [--note --branch --commit --lane a|b], lanes (read-only: split issues into two path-disjoint lanes), attempt <n>, ci-run,
         phase <phase> [--pr --previous-main-sha --merge-sha --deploy-run --note], merge-gate --pr <n>,
         blocker --kind k --note t [--issue n], blocker --resolve <index> --note t, mutex <dotnet|release-merge> --acquire|--release --holder t, worktrees --ensure <id>, decision --file f [--issue n], release-lock
Packets: packet <bundleId> <issue> | packet --from-issue <n> (writes .qm/packets/<n>.md); handback-check <file>; handback-save --issue <n> --role <role> --file <json> (.qm/handbacks/<n>-<role>.json, recorded as a claim)
Anyone:  status (text), list, cancel [--note]
Global:  --bundles-dir <dir> (default <main checkout>/.qm/bundles); --key=value also accepted
`);
    process.exit(cmd ? 1 : 0);
}
