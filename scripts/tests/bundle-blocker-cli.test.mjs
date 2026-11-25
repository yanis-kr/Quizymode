// End-to-end check for #761 gap 9 (AC 7.19.38): `blocker` records, `blocker --resolve` resolves, and `status` lists only the open ones,
// driven through the real bundle.mjs CLI against a temp --qm-dir. No real .qm state is read or written.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repo, "scripts", "bundle", "bundle.mjs");
const BID = "b-20261124-blockers";

// Every temp --qm-dir is removed when this file's tests finish, so repeated runs leave no qm-blk-* folders behind.
const made = [];
const tmpQm = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "qm-blk-")); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const run = (args) => spawnSync(process.execPath, [BUNDLE, ...args], { encoding: "utf8" });
const json = (r) => JSON.parse(r.stdout);
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n"); };

// Same envelope defaults as lead-standing.test.mjs (the lead design, #759).
const ENVELOPE = {
  schemaVersion: 1, mergeToMain: true, migrations: "additive-only", infraChanges: "none", prodDataWrites: "test-data-only",
  deleteOwnTestData: true, seedSyncApply: false, prodReadQueries: true, rollback: "rollback-workflow", closeIssues: true, paidServices: false,
  maxIssues: 8, maxSize: "m", excludeAreas: ["area:auth", "area:infra"],
};

/** Builds a bundle with one issue, approves a standing envelope, and approves the manifest standing. Returns the qm dir. */
function approvedBundle() {
  const qm = tmpQm();
  const dir = path.join(qm, "bundles", BID);
  const issue = {
    number: 101, title: "Issue 101", order: 101, snapshot: { state: "OPEN", updatedAt: "2026-11-17T00:00:00Z", bodySha256: "b".repeat(64) },
    size: "s", risk: "low", ux: false, migration: false, dependsOn: [], areas: ["area:study"],
    scope: { summary: "s", paths: ["src/x101/**"], exclusions: [] },
    acceptanceCriteria: [{ id: "AC1", text: "observable", evidence: "unit" }], validation: [],
  };
  writeJson(path.join(dir, "manifest.json"), {
    schemaVersion: 1, bundleId: BID, title: "Blocker CLI test bundle", createdAt: "2026-11-24T00:00:00Z",
    repo: { nameWithOwner: "yanis-kr/Quizymode", defaultBranch: "main" },
    source: { baseBranch: "main", commit: "a".repeat(40), capturedAt: "2026-11-24T00:00:00Z" },
    releaseMode: "auto-merge-deploy", versionBump: "minor", excluded: [],
    branches: { release: `release/${BID}`, issuePrefix: `bundle/${BID}/` },
    authorization: { mergeToMain: true, migrations: "none", infraChanges: "none", infraAllowed: [], prodDataWrites: "none", prodReadQueries: true, rollback: "report-only", closeIssues: true, paidServices: false },
    limits: { maxAttemptsPerIssue: 3, maxCiRuns: 4, maxWallClockHours: 8, lockStaleMinutes: 240 },
    releaseGates: ["filtered tests of every shipped issue"],
    policies: { partialRelease: "ship-completed-independent", blockedIssue: "defer-and-continue", sourceDrift: "proceed-unless-overlap" },
    postDeploy: { checks: [], rollbackTrigger: "report-only" },
    issues: [issue],
  });
  writeJson(path.join(qm, "envelope.json"), ENVELOPE);
  const eh = sha(path.join(qm, "envelope.json"));
  assert.equal(run(["envelope", "approve", "--hash", eh.slice(0, 12), "--user-reply", `approve ${eh.slice(0, 12)}`, "--qm-dir", qm]).status, 0);
  writeJson(path.join(dir, "review.json"), { openFindings: [], reviewer: { sessionId: "fresh-reviewer-session" } });
  const leadFile = path.join(qm, "lead.json");
  writeJson(leadFile, { id: "lead-proceed-1", question: "q", decision: "d", rationale: "r", evidence: [], assumptions: [], acImpact: "none", validationRequired: [], outcome: "proceed" });
  const mh = sha(path.join(dir, "manifest.json"));
  const a = run(["approve", BID, "--hash", mh.slice(0, 12), "--standing", "--lead-decision", leadFile, "--qm-dir", qm]);
  assert.equal(a.status, 0, a.stdout);
  return qm;
}

/** Starts the run and returns the holder id that state-init prints. */
function startRun(qm) {
  const r = run(["state-init", BID, "--no-git", "--qm-dir", qm]);
  assert.equal(r.status, 0, r.stdout);
  return json(r).holder;
}

test("AC 7.19.38: blocker records, resolve keeps the history, and status lists only the open blockers (end to end)", () => {
  const qm = approvedBundle();
  const holder = startRun(qm);
  const base = ["--holder", holder, "--qm-dir", qm];

  // Two blockers are recorded; the first names an issue.
  const b1 = run(["blocker", BID, "--kind", "environmental", "--issue", "101", "--note", "deploy timed out", ...base]);
  assert.equal(b1.status, 0, b1.stdout);
  assert.equal(json(b1).blockers, 1);
  const b2 = run(["blocker", BID, "--kind", "parked", "--note", "owner decides the wording", ...base]);
  assert.equal(b2.status, 0, b2.stdout);
  assert.equal(json(b2).blockers, 2);

  // Status lists both, with the index that resolve takes.
  const s1 = run(["status", BID, "--qm-dir", qm]);
  assert.equal(s1.status, 0, s1.stdout);
  assert.match(s1.stdout, /Blockers \(open; resolve with blocker --resolve <index>\):/);
  assert.match(s1.stdout, /\[0\] \[environmental\] #101 deploy timed out/);
  assert.match(s1.stdout, /\[1\] \[parked\] owner decides the wording/);

  // Resolving index 0 needs a note and a holder, and keeps the record in state.json.
  const noNote = run(["blocker", BID, "--resolve", "0", ...base]);
  assert.equal(noNote.status, 1, "a resolve without --note is refused");
  const resolved = run(["blocker", BID, "--resolve", "0", "--note", "re-ran the deploy, it passed", ...base]);
  assert.equal(resolved.status, 0, resolved.stdout);
  assert.equal(json(resolved).resolved, 0);
  assert.equal(json(resolved).open, 1);

  // Status drops the resolved blocker but keeps index 1 for the one still open.
  const s2 = run(["status", BID, "--qm-dir", qm]);
  assert.equal(s2.status, 0, s2.stdout);
  assert.doesNotMatch(s2.stdout, /\[0\] \[environmental\]/, "a resolved blocker leaves the open list");
  assert.match(s2.stdout, /\[1\] \[parked\] owner decides the wording/);

  // The record is kept as history: both entries stay in state.json, with the resolution on the first.
  const state = JSON.parse(fs.readFileSync(path.join(qm, "bundles", BID, "state.json"), "utf8"));
  assert.equal(state.blockers.length, 2);
  assert.equal(state.blockers[0].note, "deploy timed out", "the original note is kept");
  assert.equal(state.blockers[0].resolution, "re-ran the deploy, it passed");
  assert.ok(state.blockers[0].resolvedAt, "the resolved blocker has a time");
  assert.equal(state.blockers[1].resolvedAt, undefined, "the open blocker is untouched");

  // Resolving again, or an index that does not exist, is refused with a clear reason.
  const again = run(["blocker", BID, "--resolve", "0", "--note", "again", ...base]);
  assert.equal(again.status, 2, "an already resolved blocker is refused");
  assert.match(json(again).error, /already resolved/);
  const bad = run(["blocker", BID, "--resolve", "9", "--note", "x", ...base]);
  assert.equal(bad.status, 1, "an index that does not exist is refused");
  assert.match(json(bad).error, /blocker index/);
});

test("AC 7.19.38: recording a blocker needs the lock holder, so a stranger cannot write one", () => {
  const qm = approvedBundle();
  startRun(qm);
  const stranger = run(["blocker", BID, "--kind", "parked", "--note", "x", "--holder", "not-the-holder", "--qm-dir", qm]);
  assert.equal(stranger.status, 4, stranger.stdout);
});
