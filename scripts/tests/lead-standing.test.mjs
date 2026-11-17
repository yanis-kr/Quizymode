// Tests for #759: the qm-lead agent, precedents, the standing envelope and decision outcomes in scripts/bundle/bundle.mjs.
// Every test runs the helper against a temp --qm-dir, so no real .qm state is read or written.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repo, "scripts", "bundle", "bundle.mjs");
const BID = "b-20261117-lead";
const SELF = "scripts/tests/lead-standing.test.mjs";

const tmpQm = () => fs.mkdtempSync(path.join(os.tmpdir(), "qm-759-"));
const run = (args) => spawnSync(process.execPath, [BUNDLE, ...args], { encoding: "utf8" });
const json = (r) => JSON.parse(r.stdout);
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n"); };

// The envelope defaults from the lead design (#759), written out here so a drift in the helper shows up in the tests.
const ENVELOPE_DEFAULTS = {
  schemaVersion: 1, mergeToMain: true, migrations: "additive-only", infraChanges: "none", prodDataWrites: "test-data-only",
  deleteOwnTestData: true, seedSyncApply: false, prodReadQueries: true, rollback: "rollback-workflow", closeIssues: true, paidServices: false,
  maxIssues: 8, maxSize: "m", excludeAreas: ["area:auth", "area:infra"],
};

function issue(number, patch = {}) {
  return {
    number, title: `Issue ${number}`, order: number, snapshot: { state: "OPEN", updatedAt: "2026-11-17T00:00:00Z", bodySha256: "b".repeat(64) },
    size: "s", risk: "low", ux: false, migration: false, dependsOn: [], areas: ["area:study"],
    scope: { summary: "s", paths: [`src/x${number}/**`], exclusions: [] },
    acceptanceCriteria: [{ id: "AC1", text: "observable", evidence: "unit" }], validation: [],
    ...patch,
  };
}

/** Writes a valid manifest for BID under qm/bundles. `authPatch` overrides authorization fields; `issues` replaces the list. */
function makeManifest(qm, { authPatch = {}, issues = [issue(101)] } = {}) {
  const dir = path.join(qm, "bundles", BID);
  const manifest = {
    schemaVersion: 1, bundleId: BID, title: "Lead test bundle", createdAt: "2026-11-17T00:00:00Z",
    repo: { nameWithOwner: "yanis-kr/Quizymode", defaultBranch: "main" },
    source: { baseBranch: "main", commit: "a".repeat(40), capturedAt: "2026-11-17T00:00:00Z" },
    releaseMode: "auto-merge-deploy", versionBump: "minor", excluded: [],
    branches: { release: `release/${BID}`, issuePrefix: `bundle/${BID}/` },
    authorization: { mergeToMain: true, migrations: "none", infraChanges: "none", infraAllowed: [], prodDataWrites: "none", prodReadQueries: true, rollback: "report-only", closeIssues: true, paidServices: false, ...authPatch },
    limits: { maxAttemptsPerIssue: 3, maxCiRuns: 4, maxWallClockHours: 8, lockStaleMinutes: 240 },
    releaseGates: ["filtered tests of every shipped issue"],
    policies: { partialRelease: "ship-completed-independent", blockedIssue: "defer-and-continue", sourceDrift: "proceed-unless-overlap" },
    postDeploy: { checks: [], rollbackTrigger: "report-only" },
    issues,
  };
  writeJson(path.join(dir, "manifest.json"), manifest);
  return path.join(dir, "manifest.json");
}

/** Writes an envelope (defaults plus patch) and has the owner approve its exact bytes. */
function approvedEnvelope(qm, patch = {}) {
  writeJson(path.join(qm, "envelope.json"), { ...ENVELOPE_DEFAULTS, ...patch });
  const h = sha(path.join(qm, "envelope.json"));
  const r = run(["envelope", "approve", "--hash", h.slice(0, 12), "--user-reply", `approve ${h.slice(0, 12)}`, "--qm-dir", qm]);
  assert.equal(r.status, 0, r.stdout);
  return h;
}
function reviewClean(qm) { writeJson(path.join(qm, "bundles", BID, "review.json"), { openFindings: [] }); }
function leadDecision(qm, patch = {}) {
  const file = path.join(qm, `lead-${Math.random().toString(16).slice(2)}.json`);
  writeJson(file, { id: "lead-proceed-1", question: "q", decision: "d", rationale: "r", evidence: [], assumptions: [], acImpact: "none", validationRequired: [], outcome: "proceed", ...patch });
  return file;
}
/** Standing approval end to end: envelope approved, manifest written, review clean, lead proceed. Returns the manifest hash. */
function standingReady(qm, opts = {}) {
  makeManifest(qm, opts);
  approvedEnvelope(qm, opts.envelope);
  reviewClean(qm);
  const hash = sha(path.join(qm, "bundles", BID, "manifest.json"));
  const r = run(["approve", BID, "--hash", hash.slice(0, 12), "--standing", "--lead-decision", leadDecision(qm), "--qm-dir", qm]);
  assert.equal(r.status, 0, r.stdout);
  return hash;
}
function startRun(qm) {
  const r = run(["state-init", BID, "--no-git", "--qm-dir", qm]);
  assert.equal(r.status, 0, r.stdout);
  return json(r).holder;
}

test("AC 7.17.1 decision accepts proceed, proceed-flagged and park, rejects defer as new input, and records weakens as park (#759)", () => {
  const qm = tmpQm();
  standingReady(qm);
  const holder = startRun(qm);
  const dec = (outcome, extra = {}) => {
    const f = path.join(qm, `d-${outcome}-${Math.random().toString(16).slice(2)}.json`);
    writeJson(f, { question: "q", decision: "d", rationale: "r", acImpact: "none", validationRequired: [], outcome, parkReason: "why", ...extra });
    return run(["decision", BID, "--file", f, "--issue", "101", "--holder", holder, "--qm-dir", qm]);
  };
  for (const o of ["proceed", "proceed-flagged"]) {
    const r = dec(o);
    assert.equal(r.status, 0, `${o}: ${r.stdout}`);
    assert.equal(json(r).outcome, o);
  }
  const parked = dec("park");
  assert.equal(parked.status, 0, parked.stdout);
  assert.equal(json(parked).outcome, "park");
  const deferred = dec("defer");
  assert.equal(deferred.status, 1);
  assert.match(json(deferred).error, /proceed, proceed-flagged, park/);
  const weak = dec("proceed", { acImpact: "weakens" });
  assert.equal(weak.status, 2);
  assert.equal(json(weak).appliedOutcome, "park");
  const state = JSON.parse(fs.readFileSync(path.join(qm, "bundles", BID, "state.json"), "utf8"));
  assert.equal(state.issues["101"].status, "parked");
  assert.equal(state.decisions.at(-1).appliedOutcome, "park");
});

test("AC 7.17.2 a state.json written before this change, with defer decisions, loads and reports them as parked (#759)", () => {
  const qm = tmpQm();
  const dir = path.join(qm, "bundles", BID);
  writeJson(path.join(dir, "state.json"), {
    schemaVersion: 1, bundleId: BID, phase: "implementing", issues: { "101": { status: "deferred", attempts: 0, notes: [] } },
    decisions: [{ question: "Old question?", decision: "x", outcome: "defer", appliedOutcome: "defer", deferReason: "owner must choose", issue: 101 }],
    blockers: [], log: [],
  });
  const r = run(["status", BID, "--qm-dir", qm]);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /Parked questions \(1\)/);
  assert.match(r.stdout, /#101 Old question\? \(owner must choose\)/);
  assert.match(r.stdout, /Flagged decisions \(0\)/);
});

test("AC 7.17.3 approve --standing exits 2 without an approved envelope, when its bytes changed, and for each field the manifest exceeds (#759)", () => {
  // No envelope at all.
  let qm = tmpQm();
  makeManifest(qm);
  reviewClean(qm);
  let hash = sha(path.join(qm, "bundles", BID, "manifest.json"));
  let r = run(["approve", BID, "--hash", hash.slice(0, 12), "--standing", "--lead-decision", leadDecision(qm), "--qm-dir", qm]);
  assert.equal(r.status, 2);
  assert.match(json(r).error, /No approved standing envelope/);

  // Envelope changed after approval.
  qm = tmpQm();
  makeManifest(qm);
  approvedEnvelope(qm);
  reviewClean(qm);
  writeJson(path.join(qm, "envelope.json"), { ...ENVELOPE_DEFAULTS, maxIssues: 7 });
  hash = sha(path.join(qm, "bundles", BID, "manifest.json"));
  r = run(["approve", BID, "--hash", hash.slice(0, 12), "--standing", "--lead-decision", leadDecision(qm), "--qm-dir", qm]);
  assert.equal(r.status, 2);
  assert.match(json(r).error, /changed after the owner approved/);

  // One case per field of the envelope table.
  const cases = [
    ["mergeToMain", { mergeToMain: false }, {}],
    ["migrations", { migrations: "additive-only" }, { migrations: "any-reviewed" }],
    ["infraChanges", { infraChanges: "none" }, { infraChanges: "listed", infraAllowed: ["cache flush"] }],
    ["prodDataWrites", { prodDataWrites: "none" }, { prodDataWrites: "test-data-only" }],
    ["deleteOwnTestData", { deleteOwnTestData: false }, { deleteOwnTestData: true }],
    ["seedSyncApply", { seedSyncApply: false }, { seedSyncApply: true }],
    ["prodReadQueries", { prodReadQueries: false }, { prodReadQueries: true }],
    ["rollback", { rollback: "report-only" }, { rollback: "rollback-workflow" }],
    ["closeIssues", { closeIssues: false }, { closeIssues: true }],
    ["maxIssues", { maxIssues: 1 }, { }, [issue(101), issue(102)]],
    ["maxSize", { maxSize: "s" }, { }, [issue(101, { size: "m" })]],
    ["excludeAreas", { excludeAreas: ["area:study"] }, { }],
  ];
  for (const [field, envPatch, authPatch, issues] of cases) {
    qm = tmpQm();
    const manifestPatch = { authPatch, ...(issues ? { issues } : {}) };
    makeManifest(qm, manifestPatch);
    approvedEnvelope(qm, envPatch);
    reviewClean(qm);
    hash = sha(path.join(qm, "bundles", BID, "manifest.json"));
    r = run(["approve", BID, "--hash", hash.slice(0, 12), "--standing", "--lead-decision", leadDecision(qm), "--qm-dir", qm]);
    assert.equal(r.status, 2, `${field}: ${r.stdout}`);
    assert.match(r.stdout, new RegExp(field), `${field} named in the refusal`);
  }

  // paidServices: an envelope that allows paid services is invalid, so no standing approval can use it.
  qm = tmpQm();
  makeManifest(qm);
  approvedEnvelope(qm);
  writeJson(path.join(qm, "envelope.json"), { ...ENVELOPE_DEFAULTS, paidServices: true });
  reviewClean(qm);
  hash = sha(path.join(qm, "bundles", BID, "manifest.json"));
  r = run(["approve", BID, "--hash", hash.slice(0, 12), "--standing", "--lead-decision", leadDecision(qm), "--qm-dir", qm]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /paidServices/);
});

test("AC 7.17.4 approve --standing inside the envelope writes kind standing with the envelope hash, and verify accepts it (#759)", () => {
  const qm = tmpQm();
  const hash = standingReady(qm);
  const approval = JSON.parse(fs.readFileSync(path.join(qm, "bundles", BID, "approval.json"), "utf8"));
  assert.equal(approval.kind, "standing");
  assert.equal(approval.status, "approved");
  assert.equal(approval.envelopeSha256, sha(path.join(qm, "envelope.json")));
  assert.equal(approval.leadDecision.id, "lead-proceed-1");
  assert.equal("userReply" in approval, false, "no user reply is written");
  const v = run(["verify", BID, "--no-git", "--qm-dir", qm]);
  assert.equal(v.status, 0, v.stdout);
  assert.equal(json(v).manifestSha256, hash);
});

test("AC 7.17.4 approve --standing refuses a lead decision that is park or weakens (#759)", () => {
  const qm = tmpQm();
  makeManifest(qm);
  approvedEnvelope(qm);
  reviewClean(qm);
  const hash = sha(path.join(qm, "bundles", BID, "manifest.json"));
  const r = run(["approve", BID, "--hash", hash.slice(0, 12), "--standing", "--lead-decision", leadDecision(qm, { outcome: "park" }), "--qm-dir", qm]);
  assert.equal(r.status, 2);
  assert.match(json(r).error, /must be proceed/);
});

test("AC 7.17.5 precedent find returns a stored precedent by issue, by area and as global (#759)", () => {
  const qm = tmpQm();
  const add = (args) => { const r = run(["precedent", "add", ...args, "--qm-dir", qm]); assert.equal(r.status, 0, r.stdout); return json(r).precedent; };
  const byIssue = add(["--question", "Keep the old label?", "--answer", "yes", "--scope", "issue", "--issue", "501"]);
  const byArea = add(["--question", "Cache TTL?", "--answer", "one hour", "--scope", "area", "--area", "area:study"]);
  const global = add(["--question", "Squash merges?", "--answer", "always", "--scope", "global"]);
  const find = (args) => json(run(["precedent", "find", ...args, "--qm-dir", qm])).precedents.map((p) => p.id);
  assert.deepEqual(find(["--issue", "501"]).sort(), [byIssue, global].sort());
  assert.deepEqual(find(["--issue", "502"]), [global]);
  assert.deepEqual(find(["--area", "area:study"]).sort(), [byArea, global].sort());
  assert.deepEqual(find([]), [global]);
  const bad = run(["precedent", "add", "--question", "q", "--answer", "a", "--scope", "issue", "--qm-dir", qm]);
  assert.equal(bad.status, 1);
});

test("AC 7.17.6 qm-lead.md exists, is read-only, is opus, and qm-decision-maker is referenced nowhere (#759)", () => {
  const file = path.join(repo, ".claude", "agents", "qm-lead.md");
  const text = fs.readFileSync(file, "utf8");
  const front = text.split("\n").slice(0, 10).join("\n");
  assert.match(front, /^name:\s*qm-lead\s*$/m);
  assert.match(front, /^tools:\s*Read, Grep, Glob\s*$/m);
  assert.doesNotMatch(front, /\bEdit\b|\bWrite\b/);
  assert.match(front, /^model:\s*opus\s*$/m);
  assert.match(text, /proceed-flagged/);
  assert.match(text, /park/);
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-l", "qm-decision-maker", "--", "."], { cwd: repo, encoding: "utf8" });
  } catch (err) {
    if (err.status !== 1) throw err; // git grep exits 1 when nothing matches
  }
  const hits = out.split(/\r?\n/).filter((p) => p && p.replace(/\\/g, "/") !== SELF);
  assert.deepEqual(hits, []);
});

test("AC 7.17.7 after the third flagged decision, a fourth flagged decision on the same issue parks it as needs-refinement (#759)", () => {
  const qm = tmpQm();
  standingReady(qm);
  const holder = startRun(qm);
  const flagged = () => {
    const f = leadDecision(qm, { outcome: "proceed-flagged", id: undefined });
    return json(run(["decision", BID, "--file", f, "--issue", "101", "--holder", holder, "--qm-dir", qm]));
  };
  for (let i = 0; i < 3; i++) assert.equal(flagged().outcome, "proceed-flagged");
  const fourth = flagged();
  assert.equal(fourth.outcome, "park");
  assert.equal(fourth.reasonCode, "needs-refinement");
  const state = JSON.parse(fs.readFileSync(path.join(qm, "bundles", BID, "state.json"), "utf8"));
  assert.equal(state.issues["101"].status, "parked");
  assert.equal(state.issues["101"].parkReason, "needs-refinement");
});
