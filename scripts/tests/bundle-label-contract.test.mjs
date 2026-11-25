// Label contract (#761): the label and outcome strings .claude/agents/validator.md tells the validator to use
// must be exactly the strings the batch selector and the transition helpers use. No temp folders, no GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAILURE_LABELS, FIX_FORWARD_LABEL } from "../bundle/select.mjs";
import { validationOutcome, VALIDATION_KINDS } from "../bundle/transitions.mjs";

const validatorDoc = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.claude/agents/validator.md"), "utf8");

test("validator.md names every failure label and the fix-forward label that select.mjs reads", () => {
  for (const label of [...FAILURE_LABELS, FIX_FORWARD_LABEL]) {
    assert.ok(validatorDoc.includes(`\`${label}\``), `validator.md does not name the label \`${label}\``);
  }
});

test("validator.md names every outcome validationOutcome can return", () => {
  const outcomes = new Set();
  for (const kind of [...VALIDATION_KINDS, "unknown-kind"]) for (const cycle of [0, 1, 2]) outcomes.add(validationOutcome(kind, cycle));
  assert.ok(outcomes.size >= 3, "expected at least recheck-once, fix-forward and park");
  for (const outcome of outcomes) {
    assert.ok(validatorDoc.includes(`\`${outcome}\``), `validator.md does not name the outcome \`${outcome}\``);
  }
});
