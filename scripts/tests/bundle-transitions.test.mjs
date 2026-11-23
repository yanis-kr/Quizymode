// Tests for #761 v2 (AC 7.19.21, 7.19.23, 7.19.25): the issue status table, the release slot and the validation outcomes.
// Pure helpers only, plus temp folders for the bundle state files. No GitHub, no production.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ISSUE_STATUSES, ISSUE_TRANSITIONS, transitionError, releaseSlotHolder, RELEASE_SLOT_PHASES, validationOutcome, VALIDATION_KINDS } from "../bundle/transitions.mjs";

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "qm-v2-trans-"));
function writeBundleState(dir, id, phase) {
  fs.mkdirSync(path.join(dir, id), { recursive: true });
  fs.writeFileSync(path.join(dir, id, "state.json"), JSON.stringify({ bundleId: id, phase, issues: {} }));
}

// AC 7.19.21: the issue lifecycle moves in order; the playbook path and the validator path are both allowed.
test("AC 7.19.21: the lifecycle moves in order are allowed", () => {
  const moves = [
    ["pending", "in_progress"], ["in_progress", "implemented"], ["implemented", "validated"], ["validated", "integrated"],
    ["in_progress", "integrated"], ["implemented", "integrated"], ["integrated", "released"], ["released", "verified"],
    ["verified", "closed"], ["released", "validation_failed"], ["validation_failed", "parked"], ["pending", "pending"],
  ];
  for (const [from, to] of moves) assert.equal(transitionError(from, to), null, `${from} -> ${to}`);
});

// AC 7.19.21: skipping a step, reversing, or leaving a terminal status is refused with the allowed list.
test("AC 7.19.21: skipping, reversing or leaving a terminal status is refused", () => {
  const refused = [
    ["pending", "integrated"], ["pending", "released"], ["integrated", "pending"], ["released", "closed"],
    ["closed", "pending"], ["deferred", "in_progress"], ["parked", "closed"], ["skipped_already_done", "pending"],
  ];
  for (const [from, to] of refused) assert.match(transitionError(from, to) ?? "", /is not allowed/, `${from} -> ${to}`);
});

// AC 7.19.21: every status in the table is a known status, so the table cannot name a status the CLI rejects.
test("AC 7.19.21: the table only names known statuses", () => {
  for (const [from, targets] of Object.entries(ISSUE_TRANSITIONS)) {
    assert.ok(ISSUE_STATUSES.includes(from), `unknown source ${from}`);
    for (const to of targets) assert.ok(ISSUE_STATUSES.includes(to), `unknown target ${to} from ${from}`);
  }
  assert.match(transitionError("nope", "pending") ?? "", /not a known status/);
});

// AC 7.19.23: one bundle in a release phase holds the slot; the others see it and are refused.
test("AC 7.19.23: a bundle in a release phase holds the slot for the others", () => {
  const dir = tmpDir();
  writeBundleState(dir, "b-20261122-first-one", "release_pr_open");
  writeBundleState(dir, "b-20261122-second", "implementing");
  assert.deepEqual(releaseSlotHolder(dir, "b-20261122-second"), { bundleId: "b-20261122-first-one", phase: "release_pr_open" });
  assert.equal(releaseSlotHolder(dir, "b-20261122-first-one"), null, "a bundle does not block itself");
});

// AC 7.19.23: the slot holds from the release PR to the end of validation, and is free after it.
test("AC 7.19.23: the slot is held through validation and free after it", () => {
  assert.deepEqual([...RELEASE_SLOT_PHASES].sort(), ["ci_green", "deployed", "merged", "release_pr_open", "validating"]);
  for (const phase of ["verified", "done", "done_partial", "blocked_terminal", "not_started", "implementing"]) {
    const dir = tmpDir();
    writeBundleState(dir, "b-20261122-first-one", phase);
    writeBundleState(dir, "b-20261122-second", "release_pr_open");
    assert.equal(releaseSlotHolder(dir, "b-20261122-second"), null, `phase ${phase} should not hold the slot`);
  }
});

// AC 7.19.25: the validator's next step follows the failure kind and the fix cycle (design E).
test("AC 7.19.25: the outcome follows the failure kind and the fix cycle", () => {
  assert.deepEqual(VALIDATION_KINDS, ["environmental", "defect", "ac-wrong", "product", "rolled-back"]);
  assert.equal(validationOutcome("environmental", 0), "recheck-once");
  assert.equal(validationOutcome("defect", 0), "fix-forward");
  assert.equal(validationOutcome("defect", 1), "park", "the second failure of one issue parks it");
  assert.equal(validationOutcome("rolled-back", 0), "fix-forward", "a rollback keeps the budget");
  assert.equal(validationOutcome("ac-wrong", 0), "park");
  assert.equal(validationOutcome("product", 0), "park");
});
