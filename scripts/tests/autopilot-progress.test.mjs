// Tests for #761 v2 (AC 7.19.22): the stall rule counts a local branch move as progress, and a stalled run is shown by status.
// Temp git repo and temp .qm folder only.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main } from "../bundle/autopilot-hook.mjs";
import { readRun, writeRun, runFilePath, STALL_AFTER_BLOCKS } from "../bundle/autopilot-run.mjs";

// Temp folders this file makes are removed when the file ends, so %TEMP% does not collect qm-* folders (#761).
const madeDirs = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); madeDirs.push(d); return d; };
after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repoRoot, "scripts", "bundle", "bundle.mjs");
const BID = "b-20261122-stall-test";
const SESSION = "sess-stall";

const git = (cwd, args) => spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd, encoding: "utf8" });

function setup() {
  const repo = mkTmp("qm-v2-stall-repo-");
  git(repo, ["init", "-q"]);
  git(repo, ["commit", "-q", "--allow-empty", "-m", "init"]);
  const qm = mkTmp("qm-v2-stall-qm-");
  fs.mkdirSync(path.join(qm, "bundles", BID), { recursive: true });
  fs.writeFileSync(path.join(qm, "bundles", BID, "state.json"), JSON.stringify({ bundleId: BID, phase: "implementing", issues: {} }));
  writeRun(runFilePath(qm), { bundleId: BID, session: SESSION, phase: "implementing", stopBlocks: 0, stalled: false, lastStateHash: null });
  return { repo, qm };
}
const stop = ({ repo, qm }) => main({ mode: "stop", env: { QM_DIR: qm }, input: { session_id: SESSION }, cwd: repo });
const runOf = ({ qm }) => readRun(runFilePath(qm));

// AC 7.19.22: a commit that moves a branch is progress, so the stop counter resets and the run is not stalled.
test("AC 7.19.22: a branch move counts as progress", () => {
  const ctx = setup();
  stop(ctx);
  stop(ctx);
  assert.equal(runOf(ctx).stopBlocks, 2);
  git(ctx.repo, ["commit", "-q", "--allow-empty", "-m", "lane work"]);
  stop(ctx);
  assert.equal(runOf(ctx).stopBlocks, 1, "the branch move resets the counter");
  stop(ctx);
  stop(ctx);
  assert.equal(runOf(ctx).stalled, false);
});

// AC 7.19.22: with no progress for more than the limit, the run is stalled and the hooks stop acting.
test("AC 7.19.22: no progress past the limit stalls the run", () => {
  const ctx = setup();
  for (let i = 0; i < STALL_AFTER_BLOCKS; i++) stop(ctx);
  assert.equal(runOf(ctx).stalled, false, "not yet stalled at the limit");
  stop(ctx);
  assert.equal(runOf(ctx).stalled, true);
});

// AC 7.19.22: status shows a stalled run, so the stop is not silent.
test("AC 7.19.22: status shows a stalled run", () => {
  const ctx = setup();
  const run = runOf(ctx);
  writeRun(runFilePath(ctx.qm), { ...run, stalled: true });
  const r = spawnSync(process.execPath, [BUNDLE, "status", BID, "--qm-dir", ctx.qm], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Run: stalled after 3 blocks/);
});
