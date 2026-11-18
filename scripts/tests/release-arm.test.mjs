// Release-ready gate and arm/disarm (#761, AC 7.19.1 to 7.19.5). No GitHub calls: gh is a test double.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseReady, RELEASE_READY_NEEDS } from "../release/release-ready.mjs";
import { arm, disarm, recordReview, waitPr } from "../release/release.mjs";

const HEAD = "b94b6a8e9d50404823d017103d05294fa3e8a05d";

function fakeGh(routes) {
  const deps = {
    calls: [],
    gh(args) {
      const line = args.join(" ");
      deps.calls.push(line);
      const key = Object.keys(routes).find((k) => line.includes(k));
      if (!key) throw new Error(`unrouted gh call: ${line}`);
      const value = routes[key];
      const out = typeof value === "function" ? value(args) : value;
      return typeof out === "string" ? out : JSON.stringify(out);
    },
  };
  return deps;
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "release-arm-"));
}

const allPass = { changes: { result: "success" }, "build-test-publish": { result: "success" }, e2e: { result: "success" }, "ac-gate": { result: "success" }, "seed-quality": { result: "skipped" }, "automation-contract": { result: "success" } };

test("AC 7.19.1: release-ready passes only when every needed job succeeded or was skipped", () => {
  assert.deepEqual(releaseReady(allPass), { ok: true, failing: [] });
  const failed = releaseReady({ ...allPass, e2e: { result: "failure" } });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.failing, ["e2e"]);
  const cancelled = releaseReady({ ...allPass, "ac-gate": { result: "cancelled" } });
  assert.deepEqual(cancelled.failing, ["ac-gate"]);
  const missing = releaseReady({ ...allPass, "seed-quality": undefined });
  assert.deepEqual(missing.failing, ["seed-quality"]);
  assert.equal(RELEASE_READY_NEEDS.length, 6);
  const brokenChanges = releaseReady({ ...allPass, changes: { result: "failure" } });
  assert.deepEqual(brokenChanges.failing, ["changes"]);
});

test("AC 7.19.2: record-review stores the reviewed head and arm refuses a head it does not match", () => {
  const root = tempRoot();
  recordReview({ pr: 770, head: HEAD, clean: true, root });
  const deps = fakeGh({ "pr view": { headRefOid: "1111111111111111111111111111111111111111" } });
  const r = arm({ pr: 770, issues: [707], root, deps: { ...deps, acGate: () => ({ ok: true, detail: "" }) } });
  assert.equal(r.ok, false);
  assert.equal(r.class, "gate");
  assert.match(r.detail, /head is 11111111/);
  assert.equal(deps.calls.some((c) => c.includes("pr merge")), false);
});

test("AC 7.19.3: arm refuses without a clean reviewer pass, with a halt file, or when ac-gate fails; a clean PR calls pr merge --auto --match-head-commit", () => {
  const root = tempRoot();
  const view = fakeGh({ "pr view": { headRefOid: HEAD }, "pr merge": "" });
  const ac = () => ({ ok: true, detail: "" });
  // no reviewer record
  let r = arm({ pr: 770, issues: [707], root, deps: { ...view, acGate: ac } });
  assert.equal(r.class, "gate");
  assert.equal(view.calls.length, 1, "only the head lookup ran");
  // reviewer not clean
  recordReview({ pr: 770, head: HEAD, clean: false, root });
  r = arm({ pr: 770, issues: [707], root, deps: { ...view, acGate: ac } });
  assert.equal(r.class, "gate");
  // clean, but ac-gate fails
  recordReview({ pr: 770, head: HEAD, clean: true, root });
  r = arm({ pr: 770, issues: [707], root, deps: { ...view, acGate: () => ({ ok: false, detail: "AC 3.5.19 has no test" }) } });
  assert.equal(r.class, "gate");
  assert.match(r.detail, /AC 3.5.19/);
  // halt file
  fs.mkdirSync(path.join(root, ".qm"), { recursive: true });
  fs.writeFileSync(path.join(root, ".qm", "release-halt.json"), "{}");
  r = arm({ pr: 770, issues: [707], root, deps: { ...view, acGate: ac } });
  assert.equal(r.class, "gate");
  fs.rmSync(path.join(root, ".qm", "release-halt.json"));
  // all gates pass
  const ok = fakeGh({ "pr view": { headRefOid: HEAD }, "pr merge": "" });
  r = arm({ pr: 770, issues: [707], root, deps: { ...ok, acGate: ac } });
  assert.equal(r.ok, true);
  assert.equal(ok.calls.at(-1), `pr merge 770 --auto --merge --match-head-commit ${HEAD}`);
});

test("AC 7.19.4: disarm calls pr merge --disable-auto and clears the armed record", () => {
  const root = tempRoot();
  const deps = fakeGh({ "pr merge": "" });
  fs.mkdirSync(path.join(root, ".qm"), { recursive: true });
  fs.writeFileSync(path.join(root, ".qm", "release-state.json"), JSON.stringify({ armed: { pr: 770 } }));
  const r = disarm({ pr: 770, root, deps });
  assert.equal(r.ok, true);
  assert.equal(deps.calls.at(-1), "pr merge 770 --disable-auto");
  const state = JSON.parse(fs.readFileSync(path.join(root, ".qm", "release-state.json"), "utf8"));
  assert.equal(state.armed, undefined);
});

test("AC 7.19.5: wait-pr reports class behind when the PR's merge state is BEHIND", () => {
  const root = tempRoot();
  const deps = fakeGh({ "pr view": { statusCheckRollup: [], headRefOid: HEAD, mergeStateStatus: "BEHIND" }, "code-scanning": [], "pulls/770/comments": [] });
  const r = waitPr({ pr: 770, root, deps });
  assert.equal(r.class, "behind");
  assert.equal(r.ok, false);
  assert.equal(r.exit, 2);
});

test("AC 7.19.5: wait-pr does not report behind for a clean CLEAN PR", () => {
  const root = tempRoot();
  const deps = fakeGh({
    "pr view": { statusCheckRollup: [{ name: "build-test-publish", status: "COMPLETED", conclusion: "SUCCESS" }], headRefOid: HEAD, mergeStateStatus: "CLEAN" },
    "code-scanning": [],
    "pulls/770/comments": [],
  });
  assert.equal(waitPr({ pr: 770, root, deps }).class, "ok");
});
