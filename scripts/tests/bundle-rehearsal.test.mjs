// AC 7.19.26: a multi-issue rehearsal of one batch's life, on recorded gh output in a temp folder. No live GitHub,
// no production. It walks selection, the release slot, the validation outcomes and the slot release, for three issues
// across two bundles.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lockedIssues } from "../bundle/select.mjs";
import { transitionError, releaseSlotHolder, validationOutcome } from "../bundle/transitions.mjs";

// Temp folders this file makes are removed when the file ends, so %TEMP% does not collect qm-* folders (#761).
const madeDirs = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); madeDirs.push(d); return d; };
after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repo, "scripts", "bundle", "bundle.mjs");

// Recorded shape of `gh issue list --json number,title,labels,body` for the open status:ready issues.
const RECORDED_GH_LIST = [
  { number: 701, title: "Items edit form", labels: [{ name: "status:ready" }, { name: "priority:high" }, { name: "size:s" }, { name: "area:api" }], body: "## Acceptance criteria\n- edit saves" },
  { number: 702, title: "Study chip colour", labels: [{ name: "status:ready" }, { name: "priority:med" }, { name: "size:xs" }, { name: "area:ux" }], body: "## Acceptance criteria\n- chip is blue" },
  { number: 703, title: "Items list paging", labels: [{ name: "status:ready" }, { name: "priority:high" }, { name: "size:m" }, { name: "area:api" }], body: "## Acceptance criteria\n- next page works" },
  { number: 704, title: "Already running", labels: [{ name: "status:ready" }, { name: "size:s" }], body: "## Acceptance criteria\n- x" },
];

function writeState(dir, id, phase, issues = {}) {
  fs.mkdirSync(path.join(dir, id), { recursive: true });
  fs.writeFileSync(path.join(dir, id, "state.json"), JSON.stringify({ bundleId: id, phase, issues }));
}
const readState = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, id, "state.json"), "utf8"));

test("AC 7.19.26: a three-issue batch goes from selection to a released slot, with two bundles", () => {
  const dir = mkTmp("qm-v2-rehearsal-");
  const bundles = path.join(dir, "bundles");
  const A = "b-20261122-items-batch";
  const B = "b-20261122-study-batch";

  // Bundle B is already running and holds issue 704, so the next selection must leave it out.
  writeState(bundles, B, "implementing", { 704: { status: "in_progress" } });
  writeState(bundles, A, "not_started");

  // 1. Select the batch from the recorded list (through the CLI, the way the skill runs it).
  const listFile = path.join(dir, "gh-issue-list.json");
  fs.writeFileSync(listFile, JSON.stringify(RECORDED_GH_LIST));
  const sel = spawnSync(process.execPath, [BUNDLE, "select", "--issues-file", listFile, "--bundles-dir", bundles], { encoding: "utf8" });
  assert.equal(sel.status, 0, sel.stdout + sel.stderr);
  const picked = JSON.parse(sel.stdout);
  assert.deepEqual(picked.selected.map((s) => s.number), [701, 703, 702]);
  // The recorded list carries no scope paths, so every pair is an unknown scope and conflicts: one lane takes all three.
  assert.equal(new Set(picked.selected.map((s) => s.lane)).size, 1, "no scope paths in the list, so one lane");
  assert.equal(picked.excluded.find((e) => e.number === 704).reason, "in a running or validating bundle");

  // 2. Bundle A claims the release slot once its PR is open; bundle B cannot open a second release PR now.
  writeState(bundles, A, "release_pr_open", { 701: { status: "released" }, 702: { status: "released" }, 703: { status: "released" } });
  assert.deepEqual(releaseSlotHolder(bundles, B), { bundleId: A, phase: "release_pr_open" });
  assert.equal(releaseSlotHolder(bundles, A), null);

  // 3. Validation runs on three released issues with three outcomes: one passes, one defect is fixed forward, one is re-checked.
  const outcomes = {
    701: { result: "pass" },
    702: { result: "fail", kind: "defect", fixCycle: 0 },
    703: { result: "fail", kind: "environmental", fixCycle: 0 },
  };
  const next = {};
  for (const [num, o] of Object.entries(outcomes)) {
    const target = o.result === "pass" ? "verified" : "validation_failed";
    assert.equal(transitionError("released", target), null, `released -> ${target} for #${num}`);
    next[num] = o.result === "pass" ? "closable" : validationOutcome(o.kind, o.fixCycle);
  }
  assert.deepEqual(next, { 701: "closable", 702: "fix-forward", 703: "recheck-once" });

  // 4. Validation ends: A is done, so its slot is free and B can open its own release PR.
  writeState(bundles, A, "done", { 701: { status: "verified" }, 702: { status: "validation_failed" }, 703: { status: "validation_failed" } });
  assert.equal(releaseSlotHolder(bundles, B), null);
  writeState(bundles, B, "release_pr_open", { 704: { status: "integrated" } });

  // 5. Locks: A is finished so its issues are free; B still holds 704.
  assert.deepEqual([...lockedIssues(bundles)], [704]);
});
