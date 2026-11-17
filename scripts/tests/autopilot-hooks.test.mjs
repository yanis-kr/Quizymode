// Tests for #760: the autopilot hooks, the run file, the permissions output, the skill text and the no-envelope stop.
// Every test uses a temp .qm folder (QM_DIR for the hook, --qm-dir for bundle.mjs), so no real .qm state is read or written.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repo, "scripts", "bundle", "bundle.mjs");
const HOOK = path.join(repo, "scripts", "bundle", "autopilot-hook.mjs");
const SKILL = path.join(repo, ".claude", "skills", "qm-bundle-autopilot", "SKILL.md");
const SHIP_SKILL = path.join(repo, ".claude", "skills", "qm-bundle-ship", "SKILL.md");
const BID = "b-20261117-autopilot-test";

const tmpQm = () => fs.mkdtempSync(path.join(os.tmpdir(), "qm-760-"));
const writeJson = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n"); };
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (args) => spawnSync(process.execPath, [BUNDLE, ...args], { encoding: "utf8" });

function hook(mode, input, qm) {
  const started = performance.now();
  const r = spawnSync(process.execPath, [HOOK, mode], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, QM_DIR: qm } });
  const ms = performance.now() - started;
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout.trim() ? JSON.parse(r.stdout) : null, ms };
}

function writeRun(qm, patch = {}) {
  writeJson(path.join(qm, "autopilot", "run.json"), { bundleId: BID, session: "sess-1", phase: "implementing", stopBlocks: 0, stalled: false, lastStateHash: null, ...patch });
}
function writeState(qm, phase = "implementing") {
  writeJson(path.join(qm, "bundles", BID, "state.json"), { bundleId: BID, phase, issues: {} });
}

// AC 1: the PreToolUse hook denies AskUserQuestion only for the session that owns a live run.
test("AC1: denies AskUserQuestion for the session that owns a live run", () => {
  const qm = tmpQm();
  writeRun(qm);
  const denied = hook("ask", { session_id: "sess-1", tool_name: "AskUserQuestion" }, qm).out;
  assert.equal(denied.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(denied.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(hook("ask", { session_id: "sess-2", tool_name: "AskUserQuestion" }, qm).out, null, "another session is not held");
  assert.equal(hook("ask", { session_id: "sess-1", tool_name: "Read" }, qm).out, null, "other tools are allowed");
  writeRun(qm, { phase: "done" });
  assert.equal(hook("ask", { session_id: "sess-1", tool_name: "AskUserQuestion" }, qm).out, null, "terminal phase releases the hook");
  fs.rmSync(path.join(qm, "autopilot", "run.json"));
  assert.equal(hook("ask", { session_id: "sess-1", tool_name: "AskUserQuestion" }, qm).out, null, "no run file, no hook");
});

// AC 2: the Stop hook blocks until the phase is terminal, and stalls after three blocks with unchanged state.
test("AC2: blocks the stop while not terminal, then stalls after three unchanged blocks", () => {
  const qm = tmpQm();
  writeRun(qm);
  writeState(qm);
  for (let i = 1; i <= 3; i += 1) {
    const b = hook("stop", { session_id: "sess-1" }, qm).out;
    assert.equal(b.decision, "block", `block ${i}`);
    assert.match(b.reason, /implementing/);
  }
  assert.equal(hook("stop", { session_id: "sess-1" }, qm).out, null, "fourth unchanged stop is allowed");
  const after = JSON.parse(fs.readFileSync(path.join(qm, "autopilot", "run.json"), "utf8"));
  assert.equal(after.stalled, true);
});

test("AC2: allows the stop at a terminal phase and resets the count when state changes", () => {
  const qm = tmpQm();
  writeRun(qm);
  writeState(qm);
  assert.equal(hook("stop", { session_id: "sess-1" }, qm).out.decision, "block");
  assert.equal(hook("stop", { session_id: "sess-1" }, qm).out.decision, "block");
  writeState(qm, "validating");
  const r = hook("stop", { session_id: "sess-1" }, qm).out;
  assert.equal(r.decision, "block", "a changed state is not a stall");
  writeRun(qm, { phase: "done_partial" });
  assert.equal(hook("stop", { session_id: "sess-1" }, qm).out, null);
});

// AC 3: no run file means both hooks do nothing, and finish in under 200 ms.
// The 200 ms budget is for the hook's own work. A bare Node process takes about as long just to start on Windows,
// so the timing is taken in-process around main(); the spawned hook is checked for no output and exit 0.
test("AC3: both hooks exit with no output and finish fast when there is no run file", async () => {
  const { main } = await import(new URL(`file:///${HOOK.replace(/\\/g, "/")}`).href);
  const qm = tmpQm();
  for (const mode of ["ask", "stop"]) {
    const input = { session_id: "sess-1", tool_name: "AskUserQuestion" };
    const started = performance.now();
    const result = main({ mode, env: { QM_DIR: qm }, input, cwd: qm });
    const ms = performance.now() - started;
    assert.equal(result.out, undefined);
    assert.ok(ms < 200, `${mode} took ${Math.round(ms)} ms`);
    assert.equal(hook(mode, input, qm).out, null);
  }
});

// AC 4: the autopilot skill has no ask-once wording and no lane, integrator, release or model-routing sections.
test("AC4: the autopilot skill has no ask-once wording and none of the old sections", () => {
  const text = fs.readFileSync(SKILL, "utf8").replace(/\r\n/g, "\n");
  for (const phrase of ["ask once", "for the user to confirm", "explicit user yes"]) {
    assert.equal(text.toLowerCase().includes(phrase), false, `phrase "${phrase}" must not appear`);
  }
  const headings = text.split("\n").filter((l) => /^#{1,6} /.test(l));
  for (const word of ["Lanes", "Integrator", "Release", "Model routing"]) {
    assert.equal(headings.some((h) => h.replace(/^#+ /, "").startsWith(word)), false, `heading starting with ${word}`);
  }
});

// AC 5: bundle.mjs permissions prints valid JSON whose rules are every allowed-tools entry of the ship skill.
test("AC5: permissions prints valid JSON covering every ship-skill allowed-tools entry", () => {
  const r = run(["permissions"]);
  assert.equal(r.status, 0, r.stdout);
  const out = JSON.parse(r.stdout);
  const shipText = fs.readFileSync(SHIP_SKILL, "utf8").replace(/\r\n/g, "\n");
  const fm = shipText.match(/^---\n([\s\S]*?)\n---/)[1];
  const block = fm.split(/\nallowed-tools:\n/)[1].split(/\n(?=\S)/)[0];
  const expected = block.split("\n").filter((l) => /^\s+-\s+/.test(l)).map((l) => l.replace(/^\s+-\s+/, "").trim());
  assert.ok(expected.length > 0);
  assert.deepEqual(out.allow, expected);
});

// AC 7: approve --standing with no approved envelope ends the run: one instruction line, phase blocked_terminal.
test("AC7: approve --standing with no approved envelope exits 2 with one line and ends the run", () => {
  const qm = tmpQm();
  const dir = path.join(qm, "bundles", BID);
  writeJson(path.join(dir, "manifest.json"), {
    schemaVersion: 1, bundleId: BID, title: "t", createdAt: "2026-11-17T00:00:00Z",
    repo: { nameWithOwner: "yanis-kr/Quizymode", defaultBranch: "main" },
    source: { baseBranch: "main", commit: "a".repeat(40), capturedAt: "2026-11-17T00:00:00Z" },
    releaseMode: "auto-merge-deploy", versionBump: "minor", excluded: [],
    branches: { release: `release/${BID}`, issuePrefix: `bundle/${BID}/` },
    authorization: { mergeToMain: true, migrations: "none", infraChanges: "none", infraAllowed: [], prodDataWrites: "none", prodReadQueries: true, rollback: "report-only", closeIssues: true, paidServices: false },
    limits: { maxAttemptsPerIssue: 3, maxCiRuns: 4, maxWallClockHours: 8, lockStaleMinutes: 240 },
    releaseGates: ["x"], policies: { partialRelease: "ship-completed-independent", blockedIssue: "defer-and-continue", sourceDrift: "proceed-unless-overlap" },
    postDeploy: { checks: [], rollbackTrigger: "report-only" },
    issues: [{ number: 101, title: "Issue 101", order: 101, snapshot: { state: "OPEN", updatedAt: "2026-11-17T00:00:00Z", bodySha256: "b".repeat(64) }, size: "s", risk: "low", ux: false, migration: false, dependsOn: [], areas: ["area:study"], scope: { summary: "s", paths: ["src/x/**"], exclusions: [] }, acceptanceCriteria: [{ id: "AC1", text: "observable", evidence: "unit" }], validation: [] }],
  });
  writeJson(path.join(dir, "review.json"), { openFindings: [] });
  const hash = sha(path.join(dir, "manifest.json"));
  const r = run(["approve", BID, "--hash", hash.slice(0, 12), "--standing", "--qm-dir", qm]);
  assert.equal(r.status, 2, r.stdout);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.match(out.error, /envelope init/);
  assert.equal(out.error.includes("\n"), false, "one instruction line");
  const run760 = JSON.parse(fs.readFileSync(path.join(qm, "autopilot", "run.json"), "utf8"));
  assert.equal(run760.phase, "blocked_terminal");
});
