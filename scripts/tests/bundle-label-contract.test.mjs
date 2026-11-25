// Label contract (#761, #850): the label and outcome strings .claude/agents/validator.md tells the validator to use
// must be exactly the strings the batch selector, the transition helpers and the failure-label plan use. No temp folders, no GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAILURE_LABELS, FIX_FORWARD_LABEL } from "../bundle/select.mjs";
import { validationOutcome, VALIDATION_KINDS, VALIDATION_OUTCOMES } from "../bundle/transitions.mjs";
import { failureLabelPlan } from "../bundle/failure-labels.mjs";

const validatorDoc = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.claude/agents/validator.md"), "utf8");

test("AC 7.19.39: validator.md names every failure label and the fix-forward label that select.mjs reads", () => {
  for (const label of [...FAILURE_LABELS, FIX_FORWARD_LABEL]) {
    assert.ok(validatorDoc.includes(`\`${label}\``), `validator.md does not name the label \`${label}\``);
  }
});

test("AC 7.19.39: validator.md names every outcome validationOutcome can return", () => {
  const outcomes = new Set();
  for (const kind of [...VALIDATION_KINDS, "unknown-kind"]) for (const cycle of [0, 1, 2]) for (const recheck of [false, true]) outcomes.add(validationOutcome(kind, cycle, recheck));
  assert.ok(outcomes.size >= 5, "expected recheck-once, needs-attention, fix-forward, needs-refinement and park");
  for (const outcome of outcomes) {
    assert.ok(VALIDATION_OUTCOMES.includes(outcome), `${outcome} is not in VALIDATION_OUTCOMES`);
    assert.ok(validatorDoc.includes(`\`${outcome}\``), `validator.md does not name the outcome \`${outcome}\``);
  }
});

// AC 7.19.42: the validator applies labels through the command, and the doc names every label any plan adds or removes.
test("AC 7.19.42: validator.md calls label-failure and names every label in the plans", () => {
  assert.match(validatorDoc, /bundle\.mjs label-failure <id> --holder <token> --issue <n>/);
  for (const outcome of VALIDATION_OUTCOMES) {
    const plan = failureLabelPlan(outcome, "<id>");
    for (const label of [...plan.add, ...plan.remove]) assert.ok(validatorDoc.includes(`\`${label}\``), `validator.md does not name \`${label}\` (outcome ${outcome})`);
  }
});
