// Tests for #761 v2 design C (AC 7.19.34): rolling lanes pick each lane's next issue. Pure; no git or GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import { nextForLane } from "../bundle/rolling.mjs";

// Builds the three inputs nextForLane reads from a small table of { number, status, lane, dependsOn }.
function fixture(rows) {
  const issues = rows.map((r, i) => ({ number: r.number, order: i, dependsOn: r.dependsOn ?? [] }));
  const byNum = new Map(rows.map((r) => [r.number, r]));
  return {
    issues,
    status: (n) => byNum.get(n)?.status ?? "pending",
    laneOf: (n) => byNum.get(n)?.lane ?? null,
  };
}

// AC 7.19.34: a lane resumes its own in-progress issue before it starts anything new.
test("AC 7.19.34: a lane resumes its in-progress issue before taking a new one", () => {
  const f = fixture([
    { number: 1, status: "pending", lane: "a" },
    { number: 2, status: "in_progress", lane: "a" },
  ]);
  const r = nextForLane({ ...f, lane: "a" });
  assert.equal(r.issue, 2);
  assert.match(r.reason, /resume/);
});

// AC 7.19.34: a lane takes only its own issues, in manifest order, and never another lane's.
test("AC 7.19.34: a lane takes the first pending issue of its own, in order", () => {
  const f = fixture([
    { number: 1, status: "integrated", lane: "a" },
    { number: 2, status: "pending", lane: "b" },
    { number: 3, status: "pending", lane: "a" },
    { number: 4, status: "pending", lane: "a" },
  ]);
  assert.equal(nextForLane({ ...f, lane: "a" }).issue, 3);
  assert.equal(nextForLane({ ...f, lane: "b" }).issue, 2);
});

// AC 7.19.34: a dependent whose dependency failed or was parked waits (skipped with the reason); the lane moves on.
test("AC 7.19.34: a dependent of a failed or parked issue is skipped with a reason, and the lane moves on", () => {
  const f = fixture([
    { number: 1, status: "parked", lane: "a" },
    { number: 2, status: "pending", lane: "a", dependsOn: [1] },
    { number: 3, status: "pending", lane: "a" },
  ]);
  const r = nextForLane({ ...f, lane: "a" });
  assert.equal(r.issue, 3);
  assert.deepEqual(r.skipped, [{ issue: 2, reason: "depends on #1 (parked)" }]);
});

// AC 7.19.34: a dependent of an implemented but unintegrated issue is stacked on that branch, not started on main.
test("AC 7.19.34: a dependent of an implemented issue is stacked on that issue's branch", () => {
  const f = fixture([
    { number: 1, status: "implemented", lane: "a" },
    { number: 2, status: "pending", lane: "a", dependsOn: [1] },
  ]);
  const r = nextForLane({ ...f, lane: "a" });
  assert.equal(r.issue, 2);
  assert.equal(r.stackOn, 1);
});

// AC 7.19.34: a dependent waits while its dependency is still pending in this batch, and an empty lane says so.
test("AC 7.19.34: a dependent waits for a pending dependency, and an empty lane reports no issue", () => {
  const waiting = fixture([
    { number: 1, status: "pending", lane: "b" },
    { number: 2, status: "pending", lane: "a", dependsOn: [1] },
  ]);
  const r = nextForLane({ ...waiting, lane: "a" });
  assert.equal(r.issue, null);
  assert.equal(r.reason, "no pending issue in this lane");
});

// AC 7.19.45: a serial-slot issue (unknown scope) waits until the other lane has no pending or in-progress issue.
test("AC 7.19.45: a serial-slot issue waits for the other lane to finish", () => {
  const rows = [
    { number: 1, status: "in_progress", lane: "a" },
    { number: 2, status: "integrated", lane: "b" },
    { number: 3, status: "pending", lane: "b" },
  ];
  const busy = nextForLane({ ...fixture(rows), lane: "b", serialTail: [3] });
  assert.equal(busy.issue, null);
  assert.match(busy.reason, /serial slot: #3 waits until #1 in the other lane finish/);
  rows[0].status = "implemented";
  assert.equal(nextForLane({ ...fixture(rows), lane: "b", serialTail: [3] }).issue, 3);
  assert.equal(nextForLane({ ...fixture(rows.map((r) => ({ ...r, status: r.number === 1 ? "pending" : r.status }))), lane: "b" }).issue, 3, "without a serial tail nothing waits");
});
