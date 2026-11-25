// Tests for #850 (AC 7.19.44): the batch gate on the release branch. Pure checks with injected git, gh and ac-gate doubles,
// and CLI checks against a temp git repo and a gh stub. No git writes outside the temp folders, no GitHub.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bumpVersion, allowedVersions, propsVersion, packageVersion, batchGateErrors, gatherGateFacts, gateRecordError } from "../bundle/batch-gate.mjs";
import { writeHalt } from "../bundle/halt.mjs";
import { approvedBundle, startBundle, patchState, run, json, ghStub } from "./fixtures/bundle-cli.mjs";

const made = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const VERSION = { file: "Directory.Build.props", property: "QuizymodeVersion", mirrors: ["src/Quizymode.Web/package.json"] };
const props = (v) => `<Project>\n  <PropertyGroup>\n    <QuizymodeVersion>${v}</QuizymodeVersion>\n  </PropertyGroup>\n</Project>\n`;
const pkg = (v) => JSON.stringify({ name: "web", version: v });
const MANIFEST = { versionBump: "minor", source: { baseBranch: "main" }, branches: { release: "release/b-1" } };

/** Injected facts for one release head. Each override breaks one check. */
const HEAD = "e".repeat(40);
function deps({ base = "3.191.0", release = "3.192.0", mirror = release, acOk = true, merged = () => true, body = null, pr = { body }, worktree = { path: "/wt/release", head: HEAD, dirty: false } } = {}) {
  const files = { "origin/main": { [VERSION.file]: props(base) }, "release/b-1": { [VERSION.file]: props(release), [VERSION.mirrors[0]]: pkg(mirror) } };
  const seen = { acIssues: null };
  return {
    seen,
    readFile: (ref, file) => files[ref]?.[file] ?? null,
    runAcGate: (issues) => { seen.acIssues = issues; return acOk ? { ok: true, detail: "" } : { ok: false, detail: "AC 9.9.9 has no test" }; },
    isAncestor: (branch) => merged(branch),
    pr: () => pr,
    worktree: () => worktree,
  };
}
const STATE = { issues: { 11: { status: "integrated", branch: "bundle/b-1/11-a" }, 12: { status: "integrated", branch: "bundle/b-1/12-b" }, 13: { status: "parked", branch: null } } };
const errorsFor = (d) => batchGateErrors(gatherGateFacts({ manifest: MANIFEST, state: STATE, version: VERSION, head: HEAD, deps: d }));

test("AC 7.19.44: versions bump by the manifest level or a larger one", () => {
  assert.equal(bumpVersion("3.191.0", "patch"), "3.191.1");
  assert.equal(bumpVersion("3.191.4", "minor"), "3.192.0");
  assert.equal(bumpVersion("3.191.4", "major"), "4.0.0");
  assert.equal(bumpVersion("x", "patch"), null);
  assert.deepEqual(allowedVersions("1.2.3", "minor"), ["1.3.0", "2.0.0"]);
  assert.equal(propsVersion(props("3.191.0"), "QuizymodeVersion"), "3.191.0");
  assert.equal(packageVersion(pkg("3.191.0")), "3.191.0");
  assert.equal(packageVersion("not json"), null);
});

test("AC 7.19.44: a correct release head opens the gate, and ac-gate runs over every integrated issue", () => {
  const d = deps();
  assert.deepEqual(errorsFor(d), []);
  assert.deepEqual(d.seen.acIssues, [11, 12], "parked issues are not gated");
});

test("AC 7.19.44: each broken check names what to fix", () => {
  assert.match(errorsFor(deps({ release: "3.191.1" })).join("\n"), /version: release branch has '3\.191\.1'; a minor bump over 3\.191\.0 is 3\.192\.0/);
  assert.match(errorsFor(deps({ mirror: "3.191.0" })).join("\n"), /src\/Quizymode\.Web\/package\.json has '3\.191\.0', not 3\.192\.0/);
  assert.match(errorsFor(deps({ acOk: false })).join("\n"), /ac-gate: failed for the integrated issues: AC 9\.9\.9 has no test/);
  assert.match(errorsFor(deps({ merged: (b) => b !== "bundle/b-1/12-b" })).join("\n"), /merge: #12 branch bundle\/b-1\/12-b is not merged/);
  assert.match(errorsFor(deps({ body: "Closes #11\nRefs #12" })).join("\n"), /pr body: release PR body closes an issue on merge/);
  assert.deepEqual(errorsFor(deps({ body: "Refs #11\nRefs #12" })), [], "a Refs-only body passes");
  const noBranch = batchGateErrors(gatherGateFacts({ manifest: MANIFEST, state: { issues: { 11: { status: "integrated", branch: null } } }, version: VERSION, head: HEAD, deps: deps() }));
  assert.match(noBranch.join("\n"), /#11 has no branch recorded/);
});

// AC 7.19.44: ac-gate runs in the release worktree, so a missing, moved or dirty worktree closes the gate; so does a gh failure.
test("AC 7.19.44: a missing, moved or dirty release worktree, or an unreadable PR, closes the gate", () => {
  assert.match(errorsFor(deps({ worktree: null })).join("\n"), /worktree: the release worktree is missing/);
  assert.match(errorsFor(deps({ worktree: { path: "/wt/release", head: "f".repeat(40), dirty: false } })).join("\n"), /is at ffffffff, not the release head eeeeeeee/);
  assert.match(errorsFor(deps({ worktree: { path: "/wt/release", head: HEAD, dirty: true } })).join("\n"), /has uncommitted changes/);
  assert.match(errorsFor(deps({ pr: { error: "gh pr list failed (environmental)" } })).join("\n"), /pr body: gh pr list failed/);
  assert.deepEqual(errorsFor(deps({ pr: { body: null } })), [], "no PR yet: nothing to check");
});

test("AC 7.19.44: a gate record covers only the head it ran on", () => {
  assert.match(gateRecordError(undefined, "a".repeat(40)), /no batch gate is recorded/);
  assert.match(gateRecordError({ head: "a".repeat(40), ok: false }, "a".repeat(40)), /last batch gate failed/);
  assert.match(gateRecordError({ head: "a".repeat(40), ok: true }, "b".repeat(40)), /ran on aaaaaaaa, but the release head is bbbbbbbb/);
  assert.equal(gateRecordError({ head: "a".repeat(40), ok: true }, "a".repeat(40)), null);
});

test("AC 7.19.44: phase release_pr_open refuses without a passing batch gate", () => {
  const qm = mkTmp("qm-gate-");
  const id = "b-20261125-gate-cli";
  approvedBundle(qm, id, 950);
  const holder = startBundle(qm, id, "holder-gate");
  const r = run(["phase", id, "release_pr_open", "--pr", "77", "--holder", holder, "--qm-dir", qm]);
  assert.equal(r.status, 2, r.stdout);
  assert.match(json(r).error, /^Batch gate: no batch gate is recorded/);
});

// A temp git repo shaped like a release: main at 3.191.0 (also origin/main), an issue branch, and release/<id> at 3.192.0
// with the issue merged. Its ac-gate script is a stub that passes. Returns the repo path and the release head.
function releaseRepo(id, issue) {
  const repo = mkTmp("qm-gate-repo-");
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...a], { cwd: repo, encoding: "utf8" }).trim();
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
  git("init", "-q", "-b", "main");
  put(VERSION.file, props("3.191.0"));
  put(VERSION.mirrors[0], pkg("3.191.0"));
  put("scripts/validation/ac-gate.mjs", "process.exit(0);\n");
  git("add", "-A"); git("commit", "-q", "-m", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("switch", "-q", "-c", `bundle/${id}/${issue}-x`);
  put("src/x.txt", "x\n"); git("add", "-A"); git("commit", "-q", "-m", "issue");
  git("switch", "-q", "-c", `release/${id}`, "main");
  git("merge", "-q", "--no-ff", "-m", "merge issue", `bundle/${id}/${issue}-x`);
  put(VERSION.file, props("3.192.0"));
  put(VERSION.mirrors[0], pkg("3.192.0"));
  git("add", "-A"); git("commit", "-q", "-m", "bump");
  return { repo, head: git("rev-parse", "HEAD") };
}

/** An approved, started bundle whose issue is integrated on the temp release repo. */
function gatedBundle(id, issue) {
  const qm = mkTmp("qm-gate-");
  approvedBundle(qm, id, issue);
  const holder = startBundle(qm, id, `holder-${id}`);
  const { repo, head } = releaseRepo(id, issue);
  patchState(qm, id, (st) => { st.phase = "integrating"; st.issues[String(issue)].status = "integrated"; st.issues[String(issue)].branch = `bundle/${id}/${issue}-x`; });
  return { qm, holder, repo, head, gh: ghStub(qm, { prList: [] }) };
}

test("AC 7.19.44: the batch-gate command records a passing gate, and release_pr_open then opens on that head", () => {
  const id = "b-20261125-gate-pass";
  const { qm, holder, repo, head, gh } = gatedBundle(id, 951);
  const g = run(["batch-gate", id, "--holder", holder, "--qm-dir", qm, "--worktree", repo], { cwd: repo, env: gh.env });
  assert.equal(g.status, 0, g.stdout);
  assert.equal(json(g).head, head);
  assert.equal(json(g).version, "3.192.0");
  const st = JSON.parse(fs.readFileSync(path.join(qm, "bundles", id, "state.json"), "utf8"));
  assert.deepEqual([st.batchGate.ok, st.batchGate.head], [true, head]);
  const open = run(["phase", id, "release_pr_open", "--pr", "77", "--holder", holder, "--qm-dir", qm], { cwd: repo, env: gh.env });
  assert.equal(open.status, 0, open.stdout);
});

test("AC 7.19.44: the batch-gate command fails when gh cannot list PRs or the worktree is dirty", () => {
  const id = "b-20261125-gate-fail";
  const { qm, holder, repo, gh } = gatedBundle(id, 952);
  gh.write({ prListFail: true });
  fs.writeFileSync(path.join(repo, "stray.txt"), "uncommitted\n");
  const g = run(["batch-gate", id, "--holder", holder, "--qm-dir", qm, "--worktree", repo], { cwd: repo, env: gh.env });
  assert.equal(g.status, 2, g.stdout);
  const errors = json(g).errors.join("\n");
  assert.match(errors, /pr body: gh pr list failed/);
  assert.match(errors, /has uncommitted changes/);
  const missing = run(["batch-gate", id, "--holder", holder, "--qm-dir", qm, "--worktree", path.join(repo, "no-such-worktree")], { cwd: repo, env: gh.env });
  assert.match(json(missing).errors.join("\n"), /the release worktree is missing/);
});

test("AC 7.19.44: merge-gate refuses a gate recorded on another PR head and a PR body that closes an issue", () => {
  const id = "b-20261125-gate-merge";
  const { qm, holder, repo, head, gh } = gatedBundle(id, 953);
  assert.equal(run(["batch-gate", id, "--holder", holder, "--qm-dir", qm, "--worktree", repo], { cwd: repo, env: gh.env }).status, 0);
  patchState(qm, id, (st) => { st.phase = "ci_green"; st.release.prNumber = 77; });
  gh.write({ prView: { headRefOid: "f".repeat(40), body: "Closes #953" } });
  const r = run(["merge-gate", id, "--pr", "77", "--no-git", "--holder", holder, "--qm-dir", qm], { cwd: repo, env: gh.env });
  assert.equal(r.status, 2, r.stdout);
  const errors = json(r).errors.join("\n");
  assert.match(errors, new RegExp(`batch gate: the batch gate ran on ${head.slice(0, 8)}, but the release head is ffffffff`));
  assert.match(errors, /pr body: release PR body closes an issue on merge: "Closes #953"/);
  gh.write({ prView: { headRefOid: head, body: "Refs #953" } });
  const okRun = run(["merge-gate", id, "--pr", "77", "--no-git", "--holder", holder, "--qm-dir", qm], { cwd: repo, env: gh.env });
  assert.equal(okRun.status, 0, okRun.stdout);
});

test("AC 7.19.35: a halt file also stops release_pr_open and merge-gate", () => {
  const id = "b-20261125-gate-halt";
  const { qm, holder, repo, gh } = gatedBundle(id, 954);
  writeHalt(qm, { bundleId: "b-other", defects: [1, 2], at: new Date().toISOString(), note: "test" });
  const open = run(["phase", id, "release_pr_open", "--pr", "77", "--holder", holder, "--qm-dir", qm], { cwd: repo, env: gh.env });
  assert.equal(open.status, 2);
  assert.match(json(open).error, /Autopilot is halted/);
  const merge = run(["merge-gate", id, "--pr", "77", "--no-git", "--holder", holder, "--qm-dir", qm], { cwd: repo, env: gh.env });
  assert.equal(merge.status, 2);
  assert.match(json(merge).error, /Autopilot is halted/);
});
