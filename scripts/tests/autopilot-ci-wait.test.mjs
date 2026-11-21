// Tests for #761 AC 7.19.20: a run that waits on CI or Deploy may end its turn without stalling, the wait expires,
// and the ship playbook and skill use the PR monitor instead of foreground polling.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isWaiting, WAIT_MAX_MINUTES, STALL_AFTER_BLOCKS } from "../bundle/autopilot-run.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(repo, "scripts", "bundle", "autopilot-hook.mjs");
const RUNCLI = path.join(repo, "scripts", "bundle", "autopilot-run.mjs");
const PLAYBOOK = path.join(repo, ".claude", "skills", "qm-bundle-ship", "references", "playbook.md");
const SHIP_SKILL = path.join(repo, ".claude", "skills", "qm-bundle-ship", "SKILL.md");
const SETTINGS = path.join(repo, ".claude", "settings.local.json");
const BID = "b-20261120-ci-wait-test";

const tmpQm = () => fs.mkdtempSync(path.join(os.tmpdir(), "qm-761-"));
const writeRun = (qm, patch = {}) => {
  const file = path.join(qm, "autopilot", "run.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ bundleId: BID, session: "sess-1", phase: "ci_green", stopBlocks: 0, stalled: false, lastStateHash: null, ...patch }, null, 2) + "\n");
};
const readRun = (qm) => JSON.parse(fs.readFileSync(path.join(qm, "autopilot", "run.json"), "utf8"));
const env = (qm) => ({ ...process.env, QM_DIR: qm });
const stop = (qm) => {
  const r = spawnSync(process.execPath, [HOOK, "stop"], { input: JSON.stringify({ session_id: "sess-1" }), encoding: "utf8", env: env(qm) });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};
const cli = (qm, args) => {
  const r = spawnSync(process.execPath, [RUNCLI, ...args], { encoding: "utf8", env: env(qm) });
  return { status: r.status, out: JSON.parse(r.stdout.trim()) };
};

// AC 7.19.20a: while waiting, the Stop hook lets the turn end and does not count toward the stall limit.
test("AC7.19.20a: a waiting run may stop without stalling", () => {
  const qm = tmpQm();
  writeRun(qm, { stopBlocks: 2, waiting: { kind: "pr", pr: 900, since: new Date().toISOString() } });
  assert.equal(stop(qm), null, "waiting run is allowed to end its turn");
  const run = readRun(qm);
  assert.equal(run.stalled, false);
  assert.equal(run.stopBlocks, 0, "waiting resets the block count");
});

// AC 7.19.20b: the wait expires, so a monitor that never fires cannot hold the run open forever.
test("AC7.19.20b: an expired wait blocks the stop again and stalls after the limit", () => {
  const qm = tmpQm();
  const old = new Date(Date.now() - (WAIT_MAX_MINUTES + 5) * 60 * 1000).toISOString();
  writeRun(qm, { phase: "merged", waiting: { kind: "run", run: 1, since: old } });
  let last = null;
  for (let i = 0; i < STALL_AFTER_BLOCKS + 1; i += 1) last = stop(qm);
  assert.equal(last, null, "after the limit the hook stops blocking");
  assert.equal(readRun(qm).stalled, true);
});

// AC 7.19.20c: the wait helper is pure and time-bounded.
test("AC7.19.20c: isWaiting honors the expiry and ignores malformed waits", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(isWaiting({ waiting: { kind: "pr", pr: 1, since: "2026-11-20T11:30:00Z" } }, now), true);
  assert.equal(isWaiting({ waiting: { kind: "pr", pr: 1, since: "2026-11-20T10:00:00Z" } }, now), false);
  assert.equal(isWaiting({ waiting: { kind: "pr", pr: 1, since: "not-a-date" } }, now), false);
  assert.equal(isWaiting({}, now), false);
  assert.equal(isWaiting(null, now), false);
});

// AC 7.19.20d: the CLI records a wait for a PR or a run, and wait-clear removes it; bad input is refused.
test("AC7.19.20d: wait and wait-clear write and remove the run's waiting state", () => {
  const qm = tmpQm();
  writeRun(qm);
  const w = cli(qm, ["wait", "--pr", "901"]);
  assert.equal(w.status, 0);
  assert.equal(readRun(qm).waiting.kind, "pr");
  assert.equal(readRun(qm).waiting.pr, 901);
  const r = cli(qm, ["wait", "--run", "4455"]);
  assert.equal(r.status, 0);
  assert.equal(readRun(qm).waiting.run, 4455);
  assert.equal(cli(qm, ["wait-clear"]).out.result, "cleared");
  assert.equal(readRun(qm).waiting, undefined);
  const bad = spawnSync(process.execPath, [RUNCLI, "wait", "--pr", "abc"], { encoding: "utf8", env: env(qm) });
  assert.equal(bad.status, 1);
});

// AC 7.19.20e: the ship playbook waits through the PR monitor and never foreground-polls CI.
test("AC7.19.20e: playbook uses the PR monitor and has no foreground CI watch", () => {
  const text = fs.readFileSync(PLAYBOOK, "utf8");
  assert.match(text, /mcp__ccd_pr__set_monitor/);
  assert.match(text, /autopilot-run\.mjs wait --pr/);
  assert.match(text, /autopilot-run\.mjs wait-clear/);
  assert.doesNotMatch(text, /`gh pr checks <n> --watch`/);
});

// AC 7.19.20f: the ship skill and the settings allowlist include the tools the wait needs, so no prompt is raised.
test("AC7.19.20f: ship skill and settings allow the PR monitor tools", () => {
  const skill = fs.readFileSync(SHIP_SKILL, "utf8");
  for (const t of ["mcp__ccd_pr__get_status", "mcp__ccd_pr__bind_pr", "mcp__ccd_pr__set_monitor", "Bash(node *autopilot-run.mjs *)"]) {
    assert.ok(skill.includes(t), `ship skill allows ${t}`);
  }
  if (fs.existsSync(SETTINGS)) {
    const allow = JSON.parse(fs.readFileSync(SETTINGS, "utf8")).permissions.allow;
    for (const t of ["mcp__ccd_pr__get_status", "mcp__ccd_pr__bind_pr", "mcp__ccd_pr__set_monitor"]) assert.ok(allow.includes(t), `settings allow ${t}`);
  }
});
