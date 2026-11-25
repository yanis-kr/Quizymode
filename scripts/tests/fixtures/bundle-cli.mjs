// Shared CLI harness for bundle.mjs tests (#850): builds a standing-approved one-issue bundle in a temp --qm-dir.
// The caller owns the qm dir and removes it (made[] + after() rmSync in the test file).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const BUNDLE = path.join(repo, "scripts", "bundle", "bundle.mjs");

export const run = (args, { cwd, env } = {}) => spawnSync(process.execPath, [BUNDLE, ...args], { encoding: "utf8", cwd, env: { ...process.env, ...env } });
const GH_STUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "gh-stub.mjs");
/** Writes a gh-stub state file in dir and returns the env that makes bundle.mjs use the stub, plus a reader for the state. */
export function ghStub(dir, state = {}) {
  const file = path.join(dir, "gh-fixture.json");
  fs.writeFileSync(file, JSON.stringify({ calls: [], ...state }, null, 2));
  return { env: { QM_GH_STUB: GH_STUB, QM_GH_FIXTURE: file }, read: () => JSON.parse(fs.readFileSync(file, "utf8")), write: (patch) => fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), ...patch }, null, 2)) };
}
export const json = (r) => JSON.parse(r.stdout);
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export const writeJson = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n"); };

const ENVELOPE = {
  schemaVersion: 1, mergeToMain: true, migrations: "additive-only", infraChanges: "none", prodDataWrites: "test-data-only",
  deleteOwnTestData: true, seedSyncApply: false, prodReadQueries: true, rollback: "rollback-workflow", closeIssues: true, paidServices: false,
  maxIssues: 8, maxSize: "m", excludeAreas: ["area:auth", "area:infra"],
};

/** Approves the standing envelope in qm once (idempotent). */
function approveEnvelope(qm) {
  const file = path.join(qm, "envelope.json");
  if (fs.existsSync(path.join(qm, "envelope-approval.json"))) return;
  writeJson(file, ENVELOPE);
  const eh = sha(file);
  const r = run(["envelope", "approve", "--hash", eh.slice(0, 12), "--user-reply", `approve ${eh.slice(0, 12)}`, "--qm-dir", qm]);
  assert.equal(r.status, 0, r.stdout);
}

/** Writes and standing-approves bundle `id` with one issue `number` in qm. */
export function approvedBundle(qm, id, number = 101) {
  approveEnvelope(qm);
  const dir = path.join(qm, "bundles", id);
  const issue = {
    number, title: `Issue ${number}`, order: 1, snapshot: { state: "OPEN", updatedAt: "2026-11-17T00:00:00Z", bodySha256: "b".repeat(64) },
    size: "s", risk: "low", ux: false, migration: false, dependsOn: [], areas: ["area:study"],
    scope: { summary: "s", paths: [`src/x${number}/**`], exclusions: [] },
    acceptanceCriteria: [{ id: "AC1", text: "observable", evidence: "unit" }], validation: [],
  };
  writeJson(path.join(dir, "manifest.json"), {
    schemaVersion: 1, bundleId: id, title: "CLI test bundle", createdAt: "2026-11-24T00:00:00Z",
    repo: { nameWithOwner: "yanis-kr/Quizymode", defaultBranch: "main" },
    source: { baseBranch: "main", commit: "a".repeat(40), capturedAt: "2026-11-24T00:00:00Z" },
    releaseMode: "auto-merge-deploy", versionBump: "minor", excluded: [],
    branches: { release: `release/${id}`, issuePrefix: `bundle/${id}/` },
    authorization: { mergeToMain: true, migrations: "none", infraChanges: "none", infraAllowed: [], prodDataWrites: "none", prodReadQueries: true, rollback: "report-only", closeIssues: true, paidServices: false },
    limits: { maxAttemptsPerIssue: 3, maxCiRuns: 4, maxWallClockHours: 8, lockStaleMinutes: 240 },
    releaseGates: ["filtered tests of every shipped issue"],
    policies: { partialRelease: "ship-completed-independent", blockedIssue: "defer-and-continue", sourceDrift: "proceed-unless-overlap" },
    postDeploy: { checks: [], rollbackTrigger: "report-only" },
    issues: [issue],
  });
  writeJson(path.join(dir, "review.json"), { openFindings: [], reviewer: { sessionId: "fresh-reviewer-session" } });
  const leadFile = path.join(qm, `lead-${id}.json`);
  writeJson(leadFile, { id: "lead-proceed-1", question: "q", decision: "d", rationale: "r", evidence: [], assumptions: [], acImpact: "none", validationRequired: [], outcome: "proceed" });
  const mh = sha(path.join(dir, "manifest.json"));
  const a = run(["approve", id, "--hash", mh.slice(0, 12), "--standing", "--lead-decision", leadFile, "--qm-dir", qm]);
  assert.equal(a.status, 0, a.stdout);
}

/** state-init for bundle id with its own holder; returns the holder. */
export function startBundle(qm, id, holder) {
  const r = run(["state-init", id, "--no-git", "--holder", holder, "--qm-dir", qm]);
  assert.equal(r.status, 0, r.stdout);
  return json(r).holder;
}

/** Edits a bundle's state.json in place. */
export function patchState(qm, id, fn) {
  const file = path.join(qm, "bundles", id, "state.json");
  const st = JSON.parse(fs.readFileSync(file, "utf8"));
  fn(st);
  fs.writeFileSync(file, JSON.stringify(st, null, 2) + "\n");
}
