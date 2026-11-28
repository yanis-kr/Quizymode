// Tests for #930: bundle tooling gaps found in the UX bundle run.
// Related ACs resolve at the source commit, a wait on background agents, the release slot and a closed or merged PR,
// and the verify-tag line in worker packets. Temp folders only; gh is the recorded stub.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { releaseSlotHolder, releaseSlotMessage } from "../bundle/transitions.mjs";
import { WAIT_MAX_MINUTES, STALL_AFTER_BLOCKS } from "../bundle/autopilot-run.mjs";
import { approvedBundle, startBundle, patchState, run, json, ghStub } from "./fixtures/bundle-cli.mjs";

const madeDirs = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); madeDirs.push(d); return d; };
after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ---------- AC1: related ACs resolve at the manifest's source commit ----------
const AC_BEFORE = `# AC
## 1. Collections
### AC 1.6 Sharing (#20)
- **AC 1.6.1** [Dev] [verify: api] Owner shares (#20).
## 2. Old heading
- **AC 2.1.1** [Dev] [verify: unit] Under the old heading.
`;
const AC_AFTER = AC_BEFORE.replace("## 2. Old heading", "## 2. New heading").replace("**AC 1.6.1**", "**AC 1.9.1**");

/** A git repo holding a copy of the helper, the profile and an AC file committed with AC_BEFORE, then renamed in the working tree. */
function renamedRepo() {
  const root = mkTmp("qm-930-repo-");
  for (const rel of ["scripts/bundle", "scripts/validation", "scripts/automation", "scripts/release", ".claude/delivery-profile.json"]) {
    fs.cpSync(path.join(repo, rel), path.join(root, rel), { recursive: true });
  }
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "AC.md"), AC_BEFORE);
  const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "core.autocrlf=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q");
  git("add", "docs/AC.md");
  git("commit", "-q", "-m", "ac");
  const commit = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(root, "docs", "AC.md"), AC_AFTER);
  const bundles = path.join(root, "qm", "bundles");
  const id = "b-20261127-renamed";
  fs.mkdirSync(path.join(bundles, id), { recursive: true });
  const m = {
    schemaVersion: 1, bundleId: id, title: "T", repo: { nameWithOwner: "o/r" },
    source: { commit, baseBranch: "main" }, versionBump: "patch", excluded: [], releaseMode: "release-pr-only",
    branches: { release: `release/${id}`, issuePrefix: `bundle/${id}/` },
    authorization: { mergeToMain: false, migrations: "none", paidServices: false, infraChanges: "none", prodDataWrites: "none", rollback: "report-only" },
    limits: { maxAttemptsPerIssue: 2, maxCiRuns: 3, maxWallClockHours: 4, lockStaleMinutes: 30 },
    releaseGates: ["g"], policies: { partialRelease: "all-or-nothing", blockedIssue: "stop-bundle", sourceDrift: "stop-on-any" },
    issues: [{
      number: 20, title: "Renamed refs", order: 1, size: "s", snapshot: { updatedAt: "x", bodySha256: "b".repeat(64) }, risk: "low", ux: false, migration: false, dependsOn: [],
      scope: { summary: "s", paths: ["scripts/validation/**"], exclusions: [] },
      relatedAcs: { ids: ["1.6"], headings: ["Old heading"] },
      acceptanceCriteria: [{ id: "AC1", text: "observable", evidence: "unit" }], validation: [],
    }],
  };
  const mf = path.join(bundles, id, "manifest.json");
  fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  fs.writeFileSync(path.join(bundles, id, "approval.json"), JSON.stringify({ status: "approved", manifestSha256: sha(mf) }));
  const helper = path.join(root, "scripts", "bundle", "bundle.mjs");
  const common = ["--bundles-dir", bundles, "--packets-dir", path.join(root, "qm", "packets"), "--handbacks-dir", path.join(root, "qm", "hb")];
  const cli = (args) => spawnSync(process.execPath, [helper, ...args], { encoding: "utf8", cwd: root });
  return { root, id, cli, common, packetFile: path.join(root, "qm", "packets", "20.md") };
}

test("AC #930 AC1: after approval, a renamed related heading or id resolves at the source commit; check still rejects it", () => {
  const t = renamedRepo();
  for (const sub of [["packet", t.id, "20"], ["lanes", t.id], ["next", t.id, "--lane", "b"]]) {
    const r = t.cli([...sub, ...t.common]);
    assert.equal(r.status, 0, `${sub[0]}: ${r.stdout}${r.stderr}`);
    assert.doesNotMatch(r.stdout, /Manifest is invalid/);
  }
  const text = fs.readFileSync(t.packetFile, "utf8");
  assert.match(text, /\*\*AC 1\.6\.1\*\* \[Dev\] \[verify: api\] Owner shares/, "the id slice comes from the source commit");
  const check = t.cli(["check", t.id, ...t.common]);
  assert.equal(check.status, 2, check.stdout);
  assert.match(check.stdout, /Manifest is invalid/);
  assert.match(check.stdout, /id '1\.6' does not resolve in docs\/AC\.md/);
  assert.match(check.stdout, /heading 'Old heading' does not resolve/);
});

// ---------- AC2: a recorded wait for background agents ----------
const HOOK = path.join(repo, "scripts", "bundle", "autopilot-hook.mjs");
const RUNCLI = path.join(repo, "scripts", "bundle", "autopilot-run.mjs");
const runFile = (qm) => path.join(qm, "autopilot", "run.json");
const writeRunFile = (qm, patch = {}) => {
  fs.mkdirSync(path.dirname(runFile(qm)), { recursive: true });
  fs.writeFileSync(runFile(qm), JSON.stringify({ bundleId: "b-20261127-agents", session: "sess-930", phase: "implementing", stopBlocks: 2, stalled: false, lastStateHash: null, ...patch }, null, 2));
};
const readRunFile = (qm) => JSON.parse(fs.readFileSync(runFile(qm), "utf8"));
const stopHook = (qm) => {
  const r = spawnSync(process.execPath, [HOOK, "stop"], { input: JSON.stringify({ session_id: "sess-930" }), encoding: "utf8", env: { ...process.env, QM_DIR: qm } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};
const runCli = (qm, args) => spawnSync(process.execPath, [RUNCLI, ...args], { encoding: "utf8", env: { ...process.env, QM_DIR: qm } });

test("AC #930 AC2: wait --agents lets the turn end without counting toward the stall limit, clears, and expires", () => {
  const qm = mkTmp("qm-930-wait-");
  writeRunFile(qm);
  const w = runCli(qm, ["wait", "--agents", "2"]);
  assert.equal(w.status, 0, w.stdout);
  assert.deepEqual({ kind: readRunFile(qm).waiting.kind, agents: readRunFile(qm).waiting.agents }, { kind: "agents", agents: 2 });
  for (let i = 0; i < STALL_AFTER_BLOCKS + 2; i += 1) assert.equal(stopHook(qm), null, "a waiting run may end its turn");
  assert.equal(readRunFile(qm).stalled, false);
  assert.equal(readRunFile(qm).stopBlocks, 0);
  assert.equal(JSON.parse(runCli(qm, ["wait-clear"]).stdout).result, "cleared");
  assert.equal(readRunFile(qm).waiting, undefined);
  assert.equal(stopHook(qm).decision, "block", "after wait-clear the stop is blocked again");
  // Expired: the wait no longer holds the run open, so it blocks and stalls like a PR wait.
  writeRunFile(qm, { stopBlocks: 0, waiting: { kind: "agents", agents: 1, since: new Date(Date.now() - (WAIT_MAX_MINUTES + 1) * 60000).toISOString() } });
  let last;
  for (let i = 0; i < STALL_AFTER_BLOCKS + 1; i += 1) last = stopHook(qm);
  assert.equal(last, null);
  assert.equal(readRunFile(qm).stalled, true);
  for (const bad of [["wait", "--agents"], ["wait", "--agents", "0"], ["wait", "--agents", "x"], ["wait", "--agents", "1", "--pr", "2"]]) {
    writeRunFile(qm);
    assert.equal(runCli(qm, bad).status, 1, bad.join(" "));
  }
  const playbook = fs.readFileSync(path.join(repo, ".claude", "skills", "qm-bundle-ship", "references", "playbook.md"), "utf8");
  assert.match(playbook, /autopilot-run\.mjs wait --agents <count>/);
});

// ---------- AC3 and AC4: the release slot and the holder's PR state ----------
function slotDir(phase, prNumber = 50) {
  const dir = mkTmp("qm-930-slot-");
  const write = (id, st) => { fs.mkdirSync(path.join(dir, id), { recursive: true }); fs.writeFileSync(path.join(dir, id, "state.json"), JSON.stringify(st)); };
  write("b-20261127-first", { phase, release: { prNumber } });
  fs.writeFileSync(path.join(dir, "b-20261127-first", "manifest.json"), JSON.stringify({ repo: { nameWithOwner: "o/first" } }));
  write("b-20261127-second", { phase: "integrating", release: { prNumber: null } });
  return dir;
}

test("AC #930 AC3: a holder in release_pr_open or ci_green whose PR was closed without merging does not hold the slot", () => {
  for (const phase of ["release_pr_open", "ci_green"]) {
    const asked = [];
    const holder = releaseSlotHolder(slotDir(phase), "b-20261127-second", { prState: (pr, r) => { asked.push([pr, r]); return "CLOSED"; } });
    assert.equal(holder, null, phase);
    assert.deepEqual(asked, [[50, "o/first"]], "reads the holder's PR in the holder's repo");
  }
  // Later phases are not re-read: merged, deployed and validating still hold.
  for (const phase of ["merged", "deployed", "validating"]) {
    assert.equal(releaseSlotHolder(slotDir(phase), "b-20261127-second", { prState: () => "CLOSED" })?.bundleId, "b-20261127-first", phase);
  }
});

test("AC #930 AC4: a merged PR or an unreadable PR state keeps the slot held, and the merged refusal names the PR and the commands", () => {
  const merged = releaseSlotHolder(slotDir("ci_green"), "b-20261127-second", { prState: () => "MERGED" });
  assert.deepEqual(merged, { bundleId: "b-20261127-first", phase: "ci_green", pr: 50, prState: "MERGED" });
  const msg = releaseSlotMessage(merged);
  assert.match(msg, /release PR #50 is merged/);
  assert.match(msg, /phase b-20261127-first merged --merge-sha <sha>/);
  assert.match(msg, /validation b-20261127-first --issue <n> --result pass\|fail/);
  for (const reader of [() => null, () => { throw new Error("gh down"); }]) {
    const held = releaseSlotHolder(slotDir("release_pr_open"), "b-20261127-second", { prState: reader });
    assert.equal(held?.bundleId, "b-20261127-first");
    assert.match(releaseSlotMessage(held), /could not be read, so the slot stays held/);
  }
  assert.equal(releaseSlotHolder(slotDir("release_pr_open"), "b-20261127-second", { prState: () => "OPEN" })?.prState, "OPEN");
});

test("AC #930 AC3 AC4: phase release_pr_open reads the holder's PR through gh", () => {
  const qm = mkTmp("qm-930-cli-");
  const first = "b-20261127-first-cli";
  const second = "b-20261127-second-cli";
  approvedBundle(qm, first, 101);
  approvedBundle(qm, second, 102);
  const h1 = startBundle(qm, first, "holder-first");
  patchState(qm, first, (st) => { st.phase = "ci_green"; st.release.prNumber = 900; st.lock = null; });
  const h2 = startBundle(qm, second, "holder-second");
  const open = (state) => {
    const gh = ghStub(qm, { prView: state === null ? null : { state } });
    return { r: run(["phase", second, "release_pr_open", "--pr", "901", "--holder", h2, "--qm-dir", qm], { env: gh.env }), calls: gh.read().calls };
  };
  const merged = open("MERGED");
  assert.equal(merged.r.status, 2);
  assert.match(json(merged.r).error, /Release slot is held by bundle 'b-20261127-first-cli' \(phase ci_green\): its release PR #900 is merged/);
  assert.match(json(merged.r).error, /phase b-20261127-first-cli merged --merge-sha/);
  assert.ok(merged.calls.some((c) => c.startsWith("pr view 900 --repo yanis-kr/Quizymode --json state")), merged.calls.join("\n"));
  assert.match(json(open(null).r).error, /PR #900 could not be read/);
  // Closed without merging: the slot is free, so the refusal (if any) is the batch gate, not the slot.
  const closed = open("CLOSED");
  assert.doesNotMatch(json(closed.r).error ?? "", /Release slot/);
  assert.match(json(closed.r).error, /Batch gate/);
  assert.ok(h1);
});

// ---------- AC5: worker packets name the verify tag rule ----------
test("AC #930 AC5: a worker packet says every new or reworded AC fragment line ends with a verify tag", () => {
  const t = renamedRepo();
  const r = t.cli(["packet", t.id, "20", ...t.common]);
  assert.equal(r.status, 0, r.stdout);
  const text = fs.readFileSync(t.packetFile, "utf8");
  assert.match(text, /Every new or reworded AC line in this lane's AC fragment ends with a `\[verify: <method>\]` tag, the method being one of unit, e2e, api/);
  assert.match(fs.readFileSync(path.join(repo, ".claude", "agents", "coder.md"), "utf8"), /new or reworded AC line with a `\[verify: <method>\]` tag/);
});
