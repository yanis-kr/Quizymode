// Tests for #761 gap 1 (AC 7.19.29, 7.19.30): the owner's typed "start autopilot" approves the one bundle whose brief they were
// shown, and nothing else. Temp folders only; no GitHub, no production.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { awaitingStart, decideStart } from "../bundle/start-hook.mjs";

// Temp folders this file makes are removed when the file ends, so %TEMP% does not collect qm-* folders (#761).
const madeDirs = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); madeDirs.push(d); return d; };
after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });

const HOOK = fileURLToPath(new URL("../bundle/start-hook.mjs", import.meta.url));
const sha = (text) => createHash("sha256").update(text).digest("hex");

// Writes one bundle folder. Options pick the state the owner would be in: a brief shown for these bytes, an approval, a run.
function makeBundle(bundlesDir, id, { manifest = `{"id":"${id}"}`, briefSha = sha(manifest), approval, state = false } = {}) {
  const dir = path.join(bundlesDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), manifest);
  if (briefSha) fs.writeFileSync(path.join(dir, "brief.json"), JSON.stringify({ bundleId: id, manifestSha256: briefSha }));
  if (approval) fs.writeFileSync(path.join(dir, "approval.json"), JSON.stringify(approval));
  if (state) fs.writeFileSync(path.join(dir, "state.json"), "{}");
  return sha(manifest);
}
const tmpBundles = () => mkTmp("qm-start-");

// AC 7.19.29: only the owner's whole message counts; a sentence that quotes or negates the phrase approves nothing.
test("AC 7.19.29: only a message that is exactly 'start autopilot' is a start", () => {
  const candidates = [{ bundleId: "b-1", manifestSha256: "a".repeat(64) }];
  for (const prompt of ["start autopilot", "  Start Autopilot!  ", "start autopilot."]) {
    assert.equal(decideStart({ prompt, candidates }).action, "approve", prompt);
  }
  for (const prompt of ["please start autopilot now", "don't start autopilot", "approve aaaaaaaa", "", "start autopilot and merge", undefined]) {
    assert.equal(decideStart({ prompt, candidates }).action, "none", String(prompt));
  }
});

// AC 7.19.29: one waiting bundle is approved with the 8-character hash the owner was shown; zero or two is refused with a reason.
test("AC 7.19.29: the start approves the single waiting bundle, and refuses to guess between two", () => {
  const one = decideStart({ prompt: "start autopilot", candidates: [{ bundleId: "b-1", manifestSha256: "abcdef0123456789" + "0".repeat(48) }] });
  assert.deepEqual(one, { action: "approve", bundleId: "b-1", hash: "abcdef01" });
  const none = decideStart({ prompt: "start autopilot", candidates: [] });
  assert.equal(none.action, "none");
  assert.match(none.reason, /No bundle is waiting/);
  const two = decideStart({ prompt: "start autopilot", candidates: [{ bundleId: "b-1", manifestSha256: "a".repeat(64) }, { bundleId: "b-2", manifestSha256: "b".repeat(64) }] });
  assert.equal(two.action, "none");
  assert.match(two.reason, /2 bundles are waiting for approval \(b-1, b-2\)/);
});

// AC 7.19.29: a bundle is waiting only when the owner was shown these exact manifest bytes and it is not yet approved for them.
test("AC 7.19.29: a bundle waits only for the bytes the owner was shown", () => {
  const dir = tmpBundles();
  makeBundle(dir, "shown");
  makeBundle(dir, "changed", { briefSha: sha("old bytes") });
  makeBundle(dir, "no-brief", { briefSha: null });
  makeBundle(dir, "approved", { approval: { status: "approved", manifestSha256: sha(`{"id":"approved"}`) } });
  makeBundle(dir, "stale-approval", { approval: { status: "approved", manifestSha256: sha("older") } });
  makeBundle(dir, "started", { state: true });
  makeBundle(dir, "revoked", { approval: { status: "revoked", manifestSha256: sha(`{"id":"revoked"}`) } });
  const waiting = awaitingStart(dir).map((c) => c.bundleId).sort();
  assert.deepEqual(waiting, ["shown", "stale-approval"]);
  const shown = awaitingStart(dir).find((c) => c.bundleId === "shown");
  assert.equal(shown.manifestSha256, sha(`{"id":"shown"}`));
});

// AC 7.19.30: the hook is silent for any other message, and reports refusals in additionalContext rather than approving.
test("AC 7.19.30: the hook is silent for other messages and says why it did not approve", () => {
  const cwd = mkTmp("qm-hook-");
  const run = (prompt) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ prompt }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } });
  assert.equal(run("what is next?").stdout, "", "other messages produce no output");
  const none = JSON.parse(run("start autopilot").stdout);
  assert.equal(none.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(none.hookSpecificOutput.additionalContext, /No bundle is waiting/);
});

// AC 7.19.30: a hook input that is not JSON changes nothing and prints nothing.
test("AC 7.19.30: a malformed hook input is ignored", () => {
  const cwd = mkTmp("qm-hook-");
  const r = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
