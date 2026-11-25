// Tests for #850 (AC 7.19.42, 7.19.43): the label plan for each validation outcome, its idempotent application through an
// injected gh double, and the fix cycle read from hidden marker comments. CLI checks run against a temp --qm-dir.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { failureLabelPlan, applyFailureLabels, fixCycleFrom, nextFixCycleMarker, readComments, FIX_CYCLE_MARKER } from "../bundle/failure-labels.mjs";
import { VALIDATION_OUTCOMES } from "../bundle/transitions.mjs";
import { approvedBundle, startBundle, patchState, run, json, writeJson, ghStub } from "./fixtures/bundle-cli.mjs";

const made = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const BID = "b-20261125-labels";

// A gh double that keeps one issue's labels and records every call.
function fakeGh(initial) {
  const labels = new Set(initial);
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(" "));
    if (args[0] === "issue" && args[1] === "view") return JSON.stringify({ labels: [...labels].map((name) => ({ name })) });
    if (args[0] === "issue" && args[1] === "edit") {
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--add-label") labels.add(args[i + 1]);
        if (args[i] === "--remove-label") labels.delete(args[i + 1]);
      }
    }
    return "";
  };
  return { gh, labels, calls };
}

test("AC 7.19.42: each outcome has exactly one label plan", () => {
  const leave = ["status:ready", "fix-forward", `bundle:${BID}`];
  assert.deepEqual(failureLabelPlan("closable", BID), { add: [], remove: ["fix-forward", "validation-failed"] });
  assert.deepEqual(failureLabelPlan("recheck-once", BID), { add: [], remove: [] });
  assert.deepEqual(failureLabelPlan("fix-forward", BID), { add: ["validation-failed", "status:ready", "fix-forward"], remove: [`bundle:${BID}`] });
  assert.deepEqual(failureLabelPlan("needs-attention", BID), { add: ["validation-failed", "needs-attention"], remove: leave });
  assert.deepEqual(failureLabelPlan("needs-refinement", BID), { add: ["status:needs-refinement"], remove: leave });
  assert.deepEqual(failureLabelPlan("park", BID), { add: ["validation-failed", "parked", "needs-attention", "owner:human"], remove: leave });
  for (const o of VALIDATION_OUTCOMES) assert.ok(failureLabelPlan(o, BID), o);
  assert.throws(() => failureLabelPlan("defer", BID), /unknown validation outcome/);
});

test("AC 7.19.42: applying a plan changes only what differs, and a second run writes nothing", () => {
  const { gh, labels, calls } = fakeGh(["status:ready", `bundle:${BID}`, "size:s"]);
  const plan = failureLabelPlan("park", BID);
  const first = applyFailureLabels({ issue: 7, plan, gh });
  assert.deepEqual(first.added, ["validation-failed", "parked", "needs-attention", "owner:human"]);
  assert.deepEqual(first.removed, ["status:ready", `bundle:${BID}`], "fix-forward was not on the issue, so it is not removed");
  assert.deepEqual([...labels].sort(), ["needs-attention", "owner:human", "parked", "size:s", "validation-failed"]);
  assert.equal(calls.filter((c) => c.startsWith("label create")).length, 4, "each new label is created first");
  assert.ok(!calls.some((c) => c.includes("--force")), "an existing label's colour is never overwritten");
  const before = calls.length;
  const second = applyFailureLabels({ issue: 7, plan, gh });
  assert.equal(second.changed, false);
  assert.deepEqual(calls.slice(before), ["issue view 7 --json labels"], "the second run only reads");
});

test("AC 7.19.43: the fix cycle is the highest hidden marker in the comments, or 0", () => {
  assert.equal(fixCycleFrom([]), 0);
  assert.equal(fixCycleFrom(undefined), 0);
  assert.equal(fixCycleFrom([{ body: "no marker" }, { body: `x\n${FIX_CYCLE_MARKER(1)}` }, `${FIX_CYCLE_MARKER(2)}`, { body: "<!--qm-fix-cycle:0-->" }]), 2);
  assert.equal(fixCycleFrom([{ body: "fixCycle: 5 in prose is not a marker" }]), 0);
  assert.deepEqual(readComments({ issue: 1, commentsJson: JSON.stringify({ comments: [{ body: "a" }] }) }), [{ body: "a" }]);
  assert.deepEqual(readComments({ issue: 1, gh: () => "[{\"body\":\"b\"}]" }), [{ body: "b" }]);
});

test("AC 7.19.43: a defect fix uses one cycle; a rollback keeps the budget", () => {
  assert.equal(nextFixCycleMarker("fix-forward", "defect", 0), FIX_CYCLE_MARKER(1));
  assert.equal(nextFixCycleMarker("fix-forward", "rolled-back", 0), FIX_CYCLE_MARKER(0));
  assert.equal(nextFixCycleMarker("park", "defect", 1), null);
});

/** A bundle whose one issue (901) is released and validating, ready for `validation`. Returns { qm, holder }. */
function validatingBundle() {
  const qm = mkTmp("qm-labels-");
  approvedBundle(qm, BID, 901);
  const holder = startBundle(qm, BID, "holder-labels");
  patchState(qm, BID, (st) => { st.phase = "validating"; st.release.mergeSha = "d".repeat(40); st.issues["901"].status = "released"; });
  return { qm, holder };
}
const comments = (qm, bodies) => { const f = path.join(qm, `comments-${bodies.length}.json`); writeJson(f, { comments: bodies.map((body) => ({ body })) }); return f; };

test("AC 7.19.43: validation reads the fix cycle from the marker when --fix-cycle is not given", () => {
  const { qm, holder } = validatingBundle();
  const base = [BID, "--holder", holder, "--qm-dir", qm, "--issue", "901", "--evidence", "https://example.test/c/1"];
  const r = run(["validation", ...base, "--result", "fail", "--kind", "defect", "--comments-json", comments(qm, [`earlier failure ${FIX_CYCLE_MARKER(1)}`])]);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(json(r).fixCycle, 1);
  assert.equal(json(r).outcome, "park", "the second failure of one issue parks it");
});

test("AC 7.19.42: label-failure takes the outcome and kind from state, not from the caller", () => {
  const { qm, holder } = validatingBundle();
  const base = [BID, "--holder", holder, "--qm-dir", qm, "--issue", "901"];
  assert.equal(run(["label-failure", ...base, "--dry-run"]).status, 2, "no recorded validation yet");
  const v = run(["validation", ...base, "--evidence", "https://example.test/c/2", "--result", "fail", "--kind", "defect", "--comments-json", comments(qm, [])]);
  assert.equal(json(v).outcome, "fix-forward");
  const dry = json(run(["label-failure", ...base, "--dry-run", "--kind", "product"]));
  assert.equal(dry.outcome, "fix-forward", "a --kind flag is ignored");
  assert.equal(dry.kind, "defect");
  assert.deepEqual(dry.plan, failureLabelPlan("fix-forward", BID));
  assert.equal(dry.marker, FIX_CYCLE_MARKER(1));
});

test("AC 7.19.42: an environmental failure is re-checked once, then needs attention", () => {
  const { qm, holder } = validatingBundle();
  const base = [BID, "--holder", holder, "--qm-dir", qm, "--issue", "901", "--evidence", "https://example.test/c/3", "--result", "fail", "--kind", "environmental", "--fix-cycle", "0"];
  const first = json(run(["validation", ...base]));
  assert.equal(first.outcome, "recheck-once");
  assert.equal(first.status, "released", "the issue waits for its re-check");
  const second = json(run(["validation", ...base]));
  assert.equal(second.outcome, "needs-attention");
  assert.equal(second.status, "validation_failed");
  assert.deepEqual(json(run(["label-failure", BID, "--holder", holder, "--qm-dir", qm, "--issue", "901", "--dry-run"])).plan, failureLabelPlan("needs-attention", BID));
});

// AC 7.19.42: creating a label that already exists is not an error, and its colour is left alone; other gh errors still fail.
test("AC 7.19.42: an existing label counts as created, other gh errors do not", () => {
  const existing = (msg) => (args) => {
    if (args[0] === "label") throw new Error(msg);
    if (args[1] === "view") return JSON.stringify({ labels: [] });
    return "";
  };
  const plan = { add: ["parked"], remove: [] };
  assert.deepEqual(applyFailureLabels({ issue: 3, plan, gh: existing('label with name "parked" already exists; use `--force` to update its color') }).added, ["parked"]);
  assert.throws(() => applyFailureLabels({ issue: 3, plan, gh: existing("HTTP 502") }), /HTTP 502/);
});

// AC 7.19.42: label-failure through the CLI applies the plan with gh (a stub), and a second run changes nothing.
test("AC 7.19.42: label-failure applies the labels through gh, and a second run is idempotent", () => {
  const { qm, holder } = validatingBundle();
  const gh = ghStub(qm, { labels: ["status:ready", `bundle:${BID}`, "size:s"], existingLabels: ["parked", "status:ready"] });
  const base = [BID, "--holder", holder, "--qm-dir", qm, "--issue", "901"];
  assert.equal(run(["validation", ...base, "--evidence", "https://example.test/c/9", "--result", "fail", "--kind", "product", "--fix-cycle", "0"]).status, 0);
  const first = run(["label-failure", ...base], { env: gh.env });
  assert.equal(first.status, 0, first.stdout);
  assert.equal(json(first).outcome, "park");
  assert.deepEqual([...gh.read().labels].sort(), ["needs-attention", "owner:human", "parked", "size:s", "validation-failed"]);
  const callsAfterFirst = gh.read().calls.length;
  const second = json(run(["label-failure", ...base], { env: gh.env }));
  assert.equal(second.changed, false);
  assert.deepEqual(gh.read().calls.slice(callsAfterFirst), ["issue view 901 --repo yanis-kr/Quizymode --json labels"], "the second run only reads");
});
