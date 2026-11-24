// Tests for #761 gap 5 (AC 7.19.33): the planner for the lane and release worktrees. Pure; the git commands run in the CLI.
import test from "node:test";
import assert from "node:assert/strict";
import { planWorktrees, parseWorktreeList } from "../bundle/worktrees.mjs";

const NAMES = { laneA: "Quizymode-wt-lane-a", laneB: "Quizymode-wt-lane-b", release: "Quizymode-wt-release" };
const PORCELAIN = [
  "worktree C:/Projects/Quizymode", "HEAD abc", "branch refs/heads/main", "",
  "worktree C:/Projects/Quizymode-wt-lane-a", "HEAD def", "detached", "",
  "worktree C:/Projects/Quizymode-wt-release", "HEAD 123", "branch refs/heads/release/761-x", "",
].join("\n");

// AC 7.19.33: the planner reads folder names and branches from git output, never from assumptions.
test("AC 7.19.33: parseWorktreeList reads folder names and branches from git output", () => {
  const m = parseWorktreeList(PORCELAIN);
  assert.equal(m.get("Quizymode-wt-lane-a").branch, null);
  assert.equal(m.get("Quizymode-wt-release").branch, "release/761-x");
  assert.equal(m.has("Quizymode-wt-lane-b"), false);
});

// AC 7.19.33: missing lanes are added detached at origin/main; a missing release worktree gets a new release/<id> branch.
test("AC 7.19.33: missing worktrees are planned, lanes detached at origin/main and release on a new release/<id> branch", () => {
  const plan = planWorktrees({ names: NAMES, existing: new Map(), releaseBranch: "release/761-x", releaseBranchExists: false });
  assert.deepEqual(plan.refusals, []);
  assert.deepEqual(plan.actions.map((a) => a.name), [NAMES.laneA, NAMES.laneB, NAMES.release]);
  assert.deepEqual(plan.actions[0].args, ["--detach", "{path}", "origin/main"]);
  assert.deepEqual(plan.actions[2].args, ["-b", "release/761-x", "{path}", "origin/main"]);
});

// AC 7.19.33: an existing release worktree on the bundle's branch is reused; one on another branch is refused, never switched.
test("AC 7.19.33: a release worktree on the bundle's branch is reused, and one on another branch is refused", () => {
  const existing = parseWorktreeList(PORCELAIN);
  const reused = planWorktrees({ names: NAMES, existing, releaseBranch: "release/761-x", releaseBranchExists: true });
  assert.deepEqual(reused.actions.map((a) => a.name), [NAMES.laneB]);
  assert.deepEqual(reused.refusals, []);
  const other = planWorktrees({ names: NAMES, existing, releaseBranch: "release/761-y", releaseBranchExists: false });
  assert.equal(other.refusals.length, 1);
  assert.match(other.refusals[0], /never switches a worktree/);
});

// AC 7.19.33: an existing release branch with no worktree is checked out into one, not recreated.
test("AC 7.19.33: an existing release branch without a worktree is checked out, not recreated", () => {
  const existing = new Map([[NAMES.laneA, { path: "x", branch: null }], [NAMES.laneB, { path: "y", branch: null }]]);
  const plan = planWorktrees({ names: NAMES, existing, releaseBranch: "release/761-x", releaseBranchExists: true });
  assert.deepEqual(plan.actions, [{ lane: "release", name: NAMES.release, args: ["{path}", "release/761-x"] }]);
});
