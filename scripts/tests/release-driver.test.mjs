import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyFile } from "../ci/classify-changes.mjs";
import { deployFor, emit, evidence, main, paths, redact, refusal, ship, waitPr, gh } from "../release/release.mjs";

// A fake gh: routes each call by its argument list and records every call so tests can assert what was not run.
function fakeGh(routes) {
  const deps = {
    calls: [],
    gh(args) {
      const line = args.join(" ");
      deps.calls.push(line);
      const key = Object.keys(routes).find((k) => line.includes(k));
      if (!key) throw new Error(`unrouted gh call: ${line}`);
      const value = routes[key];
      const out = typeof value === "function" ? value(args) : value;
      return typeof out === "string" ? out : JSON.stringify(out);
    },
  };
  return deps;
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "release-driver-"));
}

const green = (names = ["build-test-publish", "CodeQL"]) =>
  names.map((name) => ({ name, status: "COMPLETED", conclusion: "SUCCESS" }));
const red = (failed) => [
  ...green(["build-test-publish"]),
  ...failed.map((name) => ({ name, status: "COMPLETED", conclusion: "FAILURE" })),
];

const noFindings = {
  "code-scanning/alerts?ref=refs/pull": [],
  "code-scanning/alerts?ref=refs/heads/main": [],
  "pulls/7/comments": [],
};

// AC 7.11.10
test("AC1: a red run returns class test with the failed job names", () => {
  const deps = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: red(["e2e", "api-tests"]), headRefOid: "abc" } });
  const r = waitPr({ pr: 7, root: tempRoot(), deps });
  assert.equal(r.class, "test");
  assert.equal(r.ok, false);
  assert.equal(r.exit, 2);
  assert.match(r.detail, /e2e/);
  assert.match(r.detail, /api-tests/);
});

test("AC1: an open alert the PR introduces returns class finding", () => {
  const alert = { number: 9, rule: { id: "js/xss" }, most_recent_instance: { location: { path: "src/a.ts", start_line: 4 } } };
  const deps = fakeGh({
    "code-scanning/alerts?ref=refs/pull": [alert],
    "code-scanning/alerts?ref=refs/heads/main": [],
    "pulls/7/comments": [],
    "pr view 7": { statusCheckRollup: green(), headRefOid: "abc" },
  });
  const r = waitPr({ pr: 7, root: tempRoot(), deps });
  assert.equal(r.class, "finding");
  assert.equal(r.exit, 2);
  assert.match(r.detail, /alert #9/);
});

test("AC1: an alert already on main is not a finding of this PR", () => {
  const alert = { number: 9, rule: { id: "js/xss" }, most_recent_instance: { location: { path: "src/a.ts", start_line: 4 } } };
  const deps = fakeGh({
    "code-scanning/alerts?ref=refs/pull": [alert],
    "code-scanning/alerts?ref=refs/heads/main": [alert],
    "pulls/7/comments": [],
    "pr view 7": { statusCheckRollup: green(), headRefOid: "abc" },
  });
  assert.equal(waitPr({ pr: 7, root: tempRoot(), deps }).class, "ok");
});

test("AC1: an unanswered review comment returns class finding; a replied one does not", () => {
  const top = { id: 11, user: { login: "github-advanced-security[bot]" }, path: "src/b.ts" };
  const unanswered = fakeGh({ ...noFindings, "pulls/7/comments": [top], "pr view 7": { statusCheckRollup: green(), headRefOid: "abc" } });
  assert.equal(waitPr({ pr: 7, root: tempRoot(), deps: unanswered }).class, "finding");
  const answered = fakeGh({
    ...noFindings,
    "pulls/7/comments": [top, { id: 12, in_reply_to_id: 11, user: { login: "me" } }],
    "pr view 7": { statusCheckRollup: green(), headRefOid: "abc" },
  });
  assert.equal(waitPr({ pr: 7, root: tempRoot(), deps: answered }).class, "ok");
});

test("AC1: all required checks passing returns ok", () => {
  const deps = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: green(), headRefOid: "abc" } });
  const r = waitPr({ pr: 7, root: tempRoot(), deps });
  assert.equal(r.ok, true);
  assert.equal(r.class, "ok");
  assert.equal(r.exit, 0);
});

// AC 7.11.11
test("AC2: a second red result with the same failing set returns same-failure and exit 3", () => {
  const root = tempRoot();
  const deps = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: red(["e2e"]), headRefOid: "abc" } });
  const first = waitPr({ pr: 7, root, deps });
  assert.equal(first.class, "test");
  assert.equal(first.exit, 2);
  const second = waitPr({ pr: 7, root, deps });
  assert.equal(second.class, "same-failure");
  assert.equal(second.exit, 3);
});

test("AC2: a different failing set is not the same failure", () => {
  const root = tempRoot();
  const first = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: red(["e2e"]), headRefOid: "abc" } });
  waitPr({ pr: 7, root, deps: first });
  const second = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: red(["api-tests"]), headRefOid: "abd" } });
  assert.equal(waitPr({ pr: 7, root, deps: second }).class, "test");
});

// AC 7.11.12
test("AC3: ship refuses while a required check is pending and never calls pr merge", () => {
  const deps = fakeGh({
    "pr view 7": { state: "OPEN", statusCheckRollup: [{ name: "CodeQL", status: "IN_PROGRESS", conclusion: "" }] },
  });
  const r = ship({ pr: 7, issues: [718], root: tempRoot(), deps });
  assert.equal(r.ok, false);
  assert.equal(r.class, "gate");
  assert.match(r.detail, /CodeQL/);
  assert.ok(!deps.calls.some((c) => c.startsWith("pr merge")));
});

test("AC3: ship refuses when a check failed", () => {
  const deps = fakeGh({ "pr view 7": { state: "OPEN", statusCheckRollup: red(["automation-contract"]) } });
  const r = ship({ pr: 7, issues: [718], root: tempRoot(), deps });
  assert.equal(r.class, "gate");
  assert.match(r.detail, /automation-contract/);
  assert.ok(!deps.calls.some((c) => c.startsWith("pr merge")));
});

test("AC3: ship refuses when ac-gate rejects an issue and names the reason", () => {
  const deps = fakeGh({ "pr view 7": { state: "OPEN", statusCheckRollup: green() } });
  deps.acGate = () => ({ ok: false, detail: "AC 7.11.10 has no verify method" });
  const r = ship({ pr: 7, issues: [718], root: tempRoot(), deps });
  assert.equal(r.class, "gate");
  assert.match(r.detail, /ac-gate rejected/);
  assert.match(r.detail, /AC 7.11.10/);
  assert.ok(!deps.calls.some((c) => c.startsWith("pr merge")));
});

test("AC3: ship refuses when the halt file exists and names it", () => {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, ".qm"), { recursive: true });
  fs.writeFileSync(path.join(root, ".qm", "release-halt.json"), "{}");
  const deps = fakeGh({ "pr view 7": { state: "OPEN", statusCheckRollup: green() } });
  const r = ship({ pr: 7, issues: [718], root, deps });
  assert.equal(r.class, "gate");
  assert.match(r.detail, /halted/);
  assert.equal(deps.calls.length, 0);
});

test("AC3: ship merges with --merge only when every gate passes", () => {
  let merged = false;
  const deps = fakeGh({
    "pr merge 7": () => {
      merged = true;
      return "";
    },
    "pr view 7": () => (merged
      ? { state: "MERGED", mergeCommit: { oid: "deadbeef00" } }
      : { state: "OPEN", statusCheckRollup: green(), headRefOid: "headsha" }),
  });
  deps.acGate = () => ({ ok: true, detail: "" });
  const r = ship({ pr: 7, issues: [718], root: tempRoot(), deps });
  assert.equal(r.class, "merged");
  assert.ok(deps.calls.includes("pr merge 7 --merge --match-head-commit headsha"));
  assert.ok(!deps.calls.some((c) => c.includes("--admin") || c.includes("--auto")));
});

// AC 7.11.13
const ciRun = { databaseId: 500, headSha: "sha1", status: "completed", conclusion: "success", createdAt: "2026-11-16T10:00:00Z" };

test("AC4: an exact triggering-run match wins over the time-based choice", () => {
  const other = { id: 600, event: "workflow_run", head_sha: "sha1", created_at: "2026-11-16T10:30:00Z", workflow_run: { id: 999 } };
  const mine = { id: 601, event: "workflow_run", head_sha: "sha1", created_at: "2026-11-16T10:40:00Z", workflow_run: { id: 500 } };
  assert.equal(deployFor("sha1", ciRun, fakeGh({ "deploy.yml/runs": { workflow_runs: [other, mine] } })).id, 601);
});

test("AC4: without a reported trigger id, the latest Deploy created after the CI run started is taken", () => {
  const early = { id: 610, event: "workflow_run", head_sha: "sha1", created_at: "2026-11-16T10:30:00Z" };
  const late = { id: 611, event: "workflow_run", head_sha: "sha1", created_at: "2026-11-16T10:50:00Z" };
  assert.equal(deployFor("sha1", ciRun, fakeGh({ "deploy.yml/runs": { workflow_runs: [early, late] } })).id, 611);
});

test("AC4: a Deploy created before the CI run started, or on another SHA, is never chosen", () => {
  const before = { id: 620, event: "workflow_run", head_sha: "sha1", created_at: "2026-11-16T09:00:00Z" };
  const otherSha = { id: 621, event: "workflow_run", head_sha: "sha2", created_at: "2026-11-16T10:30:00Z" };
  assert.equal(deployFor("sha1", ciRun, fakeGh({ "deploy.yml/runs": { workflow_runs: [before, otherSha] } })), undefined);
});

function shipDeploy(jobs, deploy = { id: 600, status: "completed", conclusion: "failure" }) {
  const root = tempRoot();
  const deps = fakeGh({
    "pr view 7": { state: "MERGED", mergeCommit: { oid: "sha1" } },
    "run list": [ciRun],
    "deploy.yml/runs": { workflow_runs: [{ ...deploy, event: "workflow_run", head_sha: "sha1", workflow_run: { id: 500 } }] },
    "actions/runs/600/jobs": { jobs },
  });
  return { r: ship({ pr: 7, issues: [718], root, deps }), root };
}

test("AC4: a failed deploy-container job returns class deploy and writes the halt file", () => {
  const { r, root } = shipDeploy([
    { name: "deploy-container", conclusion: "failure" },
    { name: "deploy-ui", conclusion: "success" },
  ]);
  assert.equal(r.class, "deploy");
  assert.equal(r.exit, 2);
  assert.ok(fs.existsSync(path.join(root, ".qm", "release-halt.json")));
});

test("AC4: a failed deploy-ui job returns class deploy", () => {
  const { r } = shipDeploy([{ name: "deploy-ui", conclusion: "failure" }]);
  assert.equal(r.class, "deploy");
});

test("AC4: skipped deploy jobs (nothing to deploy) are not a failure and write no halt file", () => {
  const { r, root } = shipDeploy([
    { name: "deploy-container", conclusion: "skipped" },
    { name: "deploy-ui", conclusion: "skipped" },
  ], { id: 600, status: "completed", conclusion: "success" });
  assert.equal(r.class, "nothing-to-deploy");
  assert.equal(r.ok, true);
  assert.ok(!fs.existsSync(path.join(root, ".qm", "release-halt.json")));
});

// AC 7.11.14
test("AC5: evidence closes only issues whose rows are all complete and leaves the rest open with the missing rows", () => {
  const deps = fakeGh({ "issue close": "" });
  deps.runEvidence = () => JSON.stringify([
    { issue: 718, complete: true, acs: 8, open: [] },
    { issue: 719, complete: false, acs: 6, open: ["AC 7.11.12: NOT RUN"] },
  ]);
  const r = evidence({ issues: [718, 719], reports: ["r.json"], close: true, root: tempRoot(), deps });
  assert.ok(deps.calls.includes("issue close 718 --reason completed"));
  assert.ok(!deps.calls.some((c) => c.includes("issue close 719")));
  assert.equal(r.ok, false);
  assert.equal(r.class, "open");
  assert.match(r.detail, /AC 7.11.12: NOT RUN/);
});

test("AC5: without --close nothing is closed even when every row is complete", () => {
  const deps = fakeGh({});
  deps.runEvidence = () => JSON.stringify([{ issue: 718, complete: true, acs: 8, open: [] }]);
  const r = evidence({ issues: [718], reports: ["r.json"], close: false, root: tempRoot(), deps });
  assert.equal(deps.calls.length, 0);
  assert.equal(r.ok, true);
});

// AC 7.11.15
test("AC6: a sentinel secret in a secret-named variable is redacted from output", () => {
  const env = { QM_TEST_TOKEN: "sentinel-7731", QM_TEST_PASSWORD: "pw-sentinel-9", PLAIN: "visible-value" };
  const out = redact("token=sentinel-7731 pw=pw-sentinel-9 plain=visible-value", env);
  assert.ok(!out.includes("sentinel-7731"));
  assert.ok(!out.includes("pw-sentinel-9"));
  assert.ok(out.includes("visible-value"));
});

test("AC6: the gh wrapper refuses to run unmocked under node --test", () => {
  assert.throws(() => gh(["pr", "view", "1"], {}), /without a test double/);
});

// AC 7.11.16
test("AC7: wait-pr refuses with class gate when the automation release lock exists", () => {
  const local = tempRoot();
  const lock = path.join(local, "Quizymode", "automation", "locks", "release.lock");
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, "{}");
  const deps = fakeGh({ "pr view 7": { statusCheckRollup: green() } });
  deps.env = { LOCALAPPDATA: local };
  const r = waitPr({ pr: 7, root: tempRoot(), deps });
  assert.equal(r.class, "gate");
  assert.match(r.detail, /lock/);
  assert.equal(deps.calls.length, 0);
});

test("AC7: no refusal when neither the halt file nor the lock exists", () => {
  const p = paths(tempRoot(), { LOCALAPPDATA: tempRoot() });
  assert.equal(refusal(p), null);
});

// AC 7.11.17
test("AC8: scripts/release/release.mjs is outside the web and api scope", () => {
  assert.deepEqual(classifyFile("scripts/release/release.mjs"), { web: false, api: false });
});

// Review fixes on the release branch
test("review: an empty check list is pending, so wait-pr is not ok and ship does not merge", () => {
  const root = tempRoot();
  const wait = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: [], headRefOid: "abc" } });
  assert.equal(waitPr({ pr: 7, root, deps: wait }).class, "pending");
  const merge = fakeGh({ "pr view 7": { state: "OPEN", statusCheckRollup: [], headRefOid: "abc" } });
  const r = ship({ pr: 7, issues: [718], root, deps: merge });
  assert.equal(r.class, "gate");
  assert.ok(!merge.calls.some((c) => c.startsWith("pr merge")));
});

test("review: a green run clears the stored failure so a later repeat is not same-failure", () => {
  const root = tempRoot();
  const red1 = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: red(["e2e"]), headRefOid: "abc" } });
  waitPr({ pr: 7, root, deps: red1 });
  const ok = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: green(), headRefOid: "abc" } });
  assert.equal(waitPr({ pr: 7, root, deps: ok }).class, "ok");
  const red2 = fakeGh({ ...noFindings, "pr view 7": { statusCheckRollup: red(["e2e"]), headRefOid: "abd" } });
  assert.equal(waitPr({ pr: 7, root, deps: red2 }).class, "test");
});

function captureLog(fn) {
  const original = console.log;
  let out = "";
  console.log = (text) => {
    out += String(text) + "\n";
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return out;
}

test("review: printed output redacts a secret that needs JSON escaping", () => {
  const secret = 'quo"te\\back';
  const env = { QM_X_TOKEN: secret };
  const out = captureLog(() => emit({ step: "s", ok: true, class: "c", detail: "value " + secret + " here", next: "", exit: 0 }, env));
  assert.ok(!out.includes(secret));
  assert.ok(out.includes("***"));
});

test("review: an unexpected error prints one JSON line and exits 2", () => {
  let code;
  const out = captureLog(() => {
    code = main(["ship", "--pr", "7"], { gh: () => { throw new Error("boom"); } });
  });
  assert.equal(code, 2);
  const parsed = JSON.parse(out.trim());
  assert.equal(parsed.class, "error");
  assert.match(parsed.detail, /boom/);
});

test("review: the latest of two Deploy runs after CI start wins, regardless of listing order", () => {
  const first = { id: 700, event: "workflow_run", head_sha: "sha1", created_at: "2026-11-16T10:30:00Z" };
  const second = { id: 701, event: "workflow_run", head_sha: "sha1", created_at: "2026-11-16T10:45:00Z" };
  assert.equal(deployFor("sha1", ciRun, fakeGh({ "deploy.yml/runs": { workflow_runs: [first, second] } })).id, 701);
});
