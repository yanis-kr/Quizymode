// Tests for #761 v2 (AC 7.19.24): batch selection. Pure selection plus the `select` command on a saved issue list.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { selectIssues, lockedIssues } from "../bundle/select.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repo, "scripts", "bundle", "bundle.mjs");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "qm-v2-select-"));
const ready = (number, labels, extra = {}) => ({ number, labels: ["status:ready", ...labels], hasAcs: true, paths: [], ...extra });

// AC 7.19.24: each excluded issue gets one reason; an eligible issue is never silently dropped.
test("AC 7.19.24: every exclusion has one factual reason", () => {
  const candidates = [
    ready(101, ["size:s", "priority:high"], { paths: ["src/Quizymode.Api/Features/Items/**"] }),
    { number: 102, labels: ["size:s"], hasAcs: true, paths: [] }, // no status:ready
    ready(103, ["size:s", "status:deferred"]),
    ready(104, ["size:s", "bundle:b-20261118-old-one"]),
    ready(105, ["size:s", "parked"]),
    ready(106, ["size:s"], { hasAcs: false }),
    ready(107, []),
    ready(108, ["size:l"]),
    ready(109, ["size:s", "area:auth"]),
    ready(110, ["size:s"]),
  ];
  const r = selectIssues(candidates, { locked: new Set([110]) });
  const reason = Object.fromEntries(r.excluded.map((e) => [e.number, e.reason]));
  assert.equal(reason[102], "no status:ready label");
  assert.equal(reason[103], "status:deferred label");
  assert.equal(reason[104], "already claimed by a bundle");
  assert.equal(reason[105], "parked or failed validation");
  assert.equal(reason[106], "no acceptance criteria");
  assert.equal(reason[107], "no size label");
  assert.match(reason[108], /over the envelope maximum size:m/);
  assert.equal(reason[109], "area:auth is excluded by the envelope");
  assert.equal(reason[110], "in a running or validating bundle");
  assert.deepEqual(r.selected.map((s) => s.number), [101]);
});

// AC 7.19.24: a fix-forward issue may come back in the next batch even though it carries a failure label.
test("AC 7.19.24: fix-forward lets a failed issue back in", () => {
  const r = selectIssues([ready(120, ["size:s", "validation-failed", "fix-forward"])]);
  assert.deepEqual(r.selected.map((s) => s.number), [120]);
});

// AC 7.19.24: rank is priority, then size, then the oldest number; only maxIssues are picked, the rest say why.
test("AC 7.19.24: ranks by priority, size and number, and keeps the top N", () => {
  const candidates = [
    ready(201, ["size:m", "priority:high"]),
    ready(202, ["size:xs", "priority:med"]),
    ready(203, ["size:s", "priority:high"]),
    ready(204, ["size:xs"]),
  ];
  const r = selectIssues(candidates, { maxIssues: 3 });
  assert.deepEqual(r.selected.map((s) => s.number), [203, 201, 202]);
  assert.deepEqual(r.selected.map((s) => s.rank), [1, 2, 3]);
  assert.deepEqual(r.excluded, [{ number: 204, reason: "rank 4: the batch holds 3" }]);
});

// AC 7.19.24: issues whose scope paths overlap, or whose scope is unknown, share a lane; disjoint ones split.
test("AC 7.19.24: conflicting issues share a lane and disjoint ones split", () => {
  const candidates = [
    ready(301, ["size:s", "priority:high"], { paths: ["src/Quizymode.Api/Features/Items/**"] }),
    ready(302, ["size:s", "priority:med"], { paths: ["src/Quizymode.Web/src/features/study/**"] }),
    ready(303, ["size:s", "priority:low"], { paths: ["src/Quizymode.Api/Features/Items/Edit.cs"] }),
  ];
  const r = selectIssues(candidates);
  const lane = Object.fromEntries(r.selected.map((s) => [s.number, s.lane]));
  assert.equal(lane[301], lane[303], "301 and 303 touch the same slice");
  assert.notEqual(lane[301], lane[302], "302 is in another area");
  assert.ok(r.conflicts.some((c) => c.a === 301 && c.b === 303));
});

// AC 7.19.24: an issue with no declared scope conflicts with everything, so it lands with the others in one lane.
test("AC 7.19.24: an unknown scope conflicts with every other issue", () => {
  const r = selectIssues([
    ready(401, ["size:s", "priority:high"], { paths: ["src/a/**"] }),
    ready(402, ["size:s", "priority:med"], { paths: [] }),
  ]);
  assert.equal(new Set(r.selected.map((s) => s.lane)).size, 1);
  assert.match(r.conflicts[0].reason, /unknown/);
});

// AC 7.19.24: lockedIssues returns only the issues of bundles that are not terminal.
test("AC 7.19.24: issues of running bundles are locked, finished ones are not", () => {
  const dir = tmp();
  const put = (id, phase, issues) => {
    fs.mkdirSync(path.join(dir, id), { recursive: true });
    fs.writeFileSync(path.join(dir, id, "state.json"), JSON.stringify({ phase, issues }));
  };
  put("b-20261122-running", "validating", { 501: {}, 502: {} });
  put("b-20261121-finished", "done", { 503: {} });
  assert.deepEqual([...lockedIssues(dir)].sort(), [501, 502]);
});

// AC 7.19.24: the select command reads a saved gh issue list (label objects as gh prints them) and the running bundles.
test("AC 7.19.24: the select command prints the batch from a saved issue list", () => {
  const dir = tmp();
  const bundles = path.join(dir, "bundles");
  fs.mkdirSync(path.join(bundles, "b-20261122-running"), { recursive: true });
  fs.writeFileSync(path.join(bundles, "b-20261122-running", "state.json"), JSON.stringify({ phase: "implementing", issues: { 602: {} } }));
  const list = [
    { number: 601, title: "a", labels: [{ name: "status:ready" }, { name: "size:s" }, { name: "priority:high" }], body: "## Acceptance criteria\n- one" },
    { number: 602, title: "b", labels: [{ name: "status:ready" }, { name: "size:xs" }], body: "## Acceptance criteria\n- two" },
    { number: 603, title: "c", labels: [{ name: "status:ready" }, { name: "size:xs" }], body: "no criteria here" },
  ];
  const file = path.join(dir, "issues.json");
  fs.writeFileSync(file, JSON.stringify(list));
  const r = spawnSync(process.execPath, [BUNDLE, "select", "--issues-file", file, "--bundles-dir", bundles], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.deepEqual(out.selected.map((s) => s.number), [601]);
  const reason = Object.fromEntries(out.excluded.map((e) => [e.number, e.reason]));
  assert.equal(reason[602], "in a running or validating bundle");
  assert.equal(reason[603], "no acceptance criteria");
  assert.deepEqual(out.lockedByRunningBundles, [602]);
});
