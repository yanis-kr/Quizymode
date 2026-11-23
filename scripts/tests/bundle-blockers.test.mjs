// Tests for #761 gap 9 (AC 7.19.27): a blocker is resolved, not deleted, and status shows only the open ones.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openBlockers, resolveBlocker } from "../bundle/blockers.mjs";

const sample = () => [
  { at: "t1", kind: "environmental", issue: 753, note: "deploy timed out" },
  { at: "t2", kind: "product-deferred", issue: null, note: "owner decides the wording" },
];

// AC 7.19.27: resolving marks the record with a time and note, keeps it in the list, and drops it from the open view.
test("AC 7.19.27: a resolved blocker stays in history and leaves the open list", () => {
  const r = resolveBlocker(sample(), 0, "re-ran the deploy, it passed", "t3");
  assert.equal(r.error, undefined);
  assert.equal(r.blockers.length, 2);
  assert.equal(r.blockers[0].resolvedAt, "t3");
  assert.equal(r.blockers[0].resolution, "re-ran the deploy, it passed");
  assert.equal(r.blockers[0].note, "deploy timed out", "the original note is kept");
  const open = openBlockers(r.blockers);
  assert.deepEqual(open.map((b) => b.index), [1], "the open view keeps the original index");
});

// AC 7.19.27: the open view reports the index that `blocker --resolve` takes, so a listed blocker can be resolved as shown.
test("AC 7.19.27: open blockers keep their index in the full list", () => {
  const open = openBlockers(sample());
  assert.deepEqual(open.map((b) => b.index), [0, 1]);
  assert.equal(open[1].kind, "product-deferred");
});

// AC 7.19.27: a bad index, a missing or blank note, and a second resolve are refused with a reason; nothing changes.
test("AC 7.19.27: bad index, missing note and double resolve are refused", () => {
  const blockers = sample();
  assert.match(resolveBlocker(blockers, 5, "x", "t").error, /blocker index/);
  assert.match(resolveBlocker(blockers, -1, "x", "t").error, /blocker index/);
  assert.match(resolveBlocker(blockers, 0.5, "x", "t").error, /blocker index/);
  assert.match(resolveBlocker(blockers, NaN, "x", "t").error, /blocker index/);
  assert.match(resolveBlocker(blockers, 0, undefined, "t").error, /--note is required/);
  assert.match(resolveBlocker(blockers, 0, "   ", "t").error, /--note is required/);
  const once = resolveBlocker(blockers, 0, "fixed", "t3");
  const twice = resolveBlocker(once.blockers, 0, "again", "t4");
  assert.match(twice.error, /already resolved/);
  assert.equal(twice.resolvedAt, "t3");
});

// AC 7.19.27: resolving returns a new list; the caller's array is not changed.
test("AC 7.19.27: resolving does not mutate the input", () => {
  const blockers = sample();
  resolveBlocker(blockers, 0, "fixed", "t3");
  assert.equal(blockers[0].resolvedAt, undefined);
});

// AC 7.19.28: the ship playbook has one merge path: release.mjs ship, never a direct gh pr merge (gap 11).
test("AC 7.19.28: the playbook merges only through release.mjs ship", () => {
  const playbook = fs.readFileSync(new URL("../../.claude/skills/qm-bundle-ship/references/playbook.md", import.meta.url), "utf8");
  assert.equal(playbook.includes("gh pr merge <n> --merge"), false, "no direct gh pr merge command in the playbook");
  assert.match(playbook, /release\.mjs ship --pr <n>/);
});
