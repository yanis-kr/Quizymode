// Tests for #761 v2 (AC 7.19.24): batch selection. Pure selection plus the `select` command on a saved issue list.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { selectIssues, lockedIssues } from "../bundle/select.mjs";
import { approvedBundle, run, json } from "./fixtures/bundle-cli.mjs";

// Temp folders this file makes are removed when the file ends, so %TEMP% does not collect qm-* folders (#761).
const madeDirs = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); madeDirs.push(d); return d; };
after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repo, "scripts", "bundle", "bundle.mjs");
const tmp = () => mkTmp("qm-v2-select-");
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

// AC 7.19.45: an issue with no scope does not pull the others into one lane: it gets a serial slot at the end of lane B.
test("AC 7.19.45: an unknown scope runs in a serial slot at the end of lane B", () => {
  const r = selectIssues([
    ready(401, ["size:s", "priority:high"], { paths: ["src/a/**"] }),
    ready(402, ["size:s", "priority:med"], { paths: [] }),
    ready(403, ["size:s", "priority:low"], { paths: ["src/b/**"] }),
  ]);
  const by = Object.fromEntries(r.selected.map((s) => [s.number, s]));
  assert.deepEqual(r.conflicts, [], "an unknown scope is not a path conflict");
  assert.notEqual(by[401].lane, by[403].lane, "the known issues still split");
  assert.equal(by[402].lane, "b");
  assert.equal(by[402].serial, true);
  assert.match(r.warnings.join("\n"), /unknown scope for #402/);
});

// AC 7.19.45: a fix-forward issue ranks ahead of a higher priority.
test("AC 7.19.45: fix-forward ranks first", () => {
  const r = selectIssues([
    ready(501, ["size:xs", "priority:high"]),
    ready(502, ["size:m", "priority:low", "validation-failed", "fix-forward"]),
  ]);
  assert.deepEqual(r.selected.map((s) => s.number), [502, 501]);
  assert.match(r.selected[0].reason, /^fix-forward/);
});

// AC 7.19.45: the select command reads maxIssues, maxSize and excludeAreas from the envelope; flags override it.
test("AC 7.19.45: select reads the envelope limits, and flags override them", () => {
  const dir = tmp();
  const bundles = path.join(dir, "bundles");
  fs.mkdirSync(bundles, { recursive: true });
  fs.writeFileSync(path.join(dir, "envelope.json"), JSON.stringify({
    schemaVersion: 1, mergeToMain: true, migrations: "additive-only", infraChanges: "none", prodDataWrites: "test-data-only",
    deleteOwnTestData: true, seedSyncApply: false, prodReadQueries: true, rollback: "rollback-workflow", closeIssues: true, paidServices: false,
    maxIssues: 1, maxSize: "xs", excludeAreas: ["area:games"],
  }));
  const item = (number, labels) => ({ number, title: String(number), labels: ["status:ready", ...labels].map((name) => ({ name })), body: "## Acceptance criteria\n- x" });
  const file = path.join(dir, "issues.json");
  fs.writeFileSync(file, JSON.stringify([item(701, ["size:xs"]), item(702, ["size:xs"]), item(703, ["size:s"]), item(704, ["size:xs", "area:games"])]));
  const sel = (...flags) => JSON.parse(spawnSync(process.execPath, [BUNDLE, "select", "--issues-file", file, "--bundles-dir", bundles, ...flags], { encoding: "utf8" }).stdout);
  const env = sel();
  assert.deepEqual(env.selected.map((s) => s.number), [701]);
  const reason = Object.fromEntries(env.excluded.map((e) => [e.number, e.reason]));
  assert.equal(reason[702], "rank 2: the batch holds 1");
  assert.match(reason[703], /over the envelope maximum size:xs/);
  assert.equal(reason[704], "area:games is excluded by the envelope");
  assert.equal(env.limits.source, path.join(dir, "envelope.json"));
  assert.ok(env.checklist.includes("  1. #701 lane b (serial, unknown scope) - size:xs"), env.checklist.join("\n"));
  const flags = sel("--max", "8", "--max-size", "s", "--exclude-areas", "auth");
  assert.deepEqual(flags.selected.map((s) => s.number).sort(), [701, 702, 703, 704]);
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

// AC 7.19.45: lane planning (`lanes`, `next`) treats unknown scope the same way: a serial slot after lane B's other issues.
test("AC 7.19.45: lanes and next put an unknown-scope issue at the end of lane B", () => {
  const qm = tmp();
  const id = "b-20261125-serial-tail";
  approvedBundle(qm, id, 801);
  const file = path.join(qm, "bundles", id, "manifest.json");
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  const base = m.issues[0];
  const issue = (number, order, paths) => ({ ...base, number, order, title: `Issue ${number}`, areas: [], scope: { ...base.scope, paths } });
  m.issues = [issue(801, 1, []), issue(802, 2, ["src/a/**"]), issue(803, 3, ["src/b/**"]), issue(804, 4, ["src/c/**"])];
  fs.writeFileSync(file, JSON.stringify(m, null, 2));
  const lanes = json(run(["lanes", id, "--qm-dir", qm]));
  assert.deepEqual(lanes.serialTail, [801]);
  assert.equal(lanes.laneB.at(-1), 801, "the unknown-scope issue is last in lane B");
  assert.equal(lanes.laneA.length + lanes.laneB.length, 4);
  assert.ok(!lanes.laneA.includes(801));
  assert.match(lanes.reasons.join("\n"), /#801: unknown scope, serial slot at the end of lane B/);
  const next = json(run(["next", id, "--lane", "b", "--qm-dir", qm]));
  assert.equal(next.issue, lanes.laneB[0], "lane B works its known issues before the serial slot");
  assert.notEqual(next.issue, 801);
  // The serial slot waits while lane A still has pending work, and starts once lane A is done.
  const state = path.join(qm, "bundles", id, "state.json");
  const put = (statuses) => fs.writeFileSync(state, JSON.stringify({ phase: "implementing", issues: Object.fromEntries(Object.entries(statuses).map(([n, [status, lane]]) => [n, { status, lane, notes: [] }])) }));
  put({ 801: ["pending", "b"], 802: ["pending", "a"], 803: ["integrated", "b"], 804: ["in_progress", "a"] });
  const waits = json(run(["next", id, "--lane", "b", "--qm-dir", qm]));
  assert.equal(waits.issue, null);
  assert.match(waits.reason, /serial slot: #801 waits until #802, #804/);
  put({ 801: ["pending", "b"], 802: ["integrated", "a"], 803: ["integrated", "b"], 804: ["implemented", "a"] });
  assert.equal(json(run(["next", id, "--lane", "b", "--qm-dir", qm])).issue, 801);
});
