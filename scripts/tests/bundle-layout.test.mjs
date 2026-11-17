import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// AC 7.16.1 to 7.16.6: the bundle skill rename, the helper move and the documentation fixes.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(repo, ...rel.split("/")), "utf8");
const OLD = ["qm-refine-bundle", "qm-implement-bundle", "quizymode-autopilot", "quizymode-prepush"];
const SELF = "scripts/tests/bundle-layout.test.mjs";

test("no tracked file names an old bundle skill (AC 7.16.1)", () => {
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-l", "-E", OLD.join("|"), "--", "."], { cwd: repo, encoding: "utf8" });
  } catch (err) {
    // git grep exits 1 when nothing matches
    if (err.status !== 1) throw err;
  }
  const hits = out.split(/\r?\n/).filter((p) => p && p.replace(/\\/g, "/") !== SELF);
  assert.deepEqual(hits, []);
});

test("the helper runs from scripts/bundle and lists bundles (AC 7.16.2)", () => {
  const out = execFileSync(process.execPath, [path.join(repo, "scripts", "bundle", "bundle.mjs"), "list"], { cwd: repo, encoding: "utf8" });
  assert.equal(JSON.parse(out).ok, true);
});

test("the playbook junction command is on one line and names both node_modules paths (AC 7.16.4)", () => {
  const playbook = read(".claude/skills/qm-bundle-ship/references/playbook.md");
  const line = playbook.split(/\r?\n/).find((l) => l.includes("mklink /J"));
  assert.ok(line, "junction line exists");
  assert.match(line, /src\\Quizymode\.Web\\node_modules/);
  assert.match(line, /C:\\Projects\\Quizymode\\src\\Quizymode\.Web\\node_modules/);
  assert.doesNotMatch(playbook, /Quizymode-wt-bundle-/);
});

test("refine steps are numbered 1 to 12 with one epic rule in step 2 (AC 7.16.5)", () => {
  const lines = read(".claude/skills/qm-bundle-refine/SKILL.md").split(/\r?\n/);
  const steps = lines.filter((l) => /^\d+[a-z]?\. \*\*/.test(l)).map((l) => l.match(/^(\d+[a-z]?)\./)[1]);
  assert.deepEqual(steps, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  const step2 = lines.find((l) => /^2\. \*\*Candidates/.test(l));
  assert.equal((step2.match(/epic/gi) || []).length, 1, "the epic rule appears once");
  assert.doesNotMatch(read(".claude/skills/qm-bundle-refine/SKILL.md"), /Skip `epic` umbrella issues as work items/);
});

test("the bundle release doc says discovery picks up to 8 issues (AC 7.16.5)", () => {
  const doc = read("docs/workflows/bundle-release.md");
  assert.match(doc, /Refine \(discover, up to 8 issues\)/);
  assert.doesNotMatch(doc, /discover, 5 issues/);
});

test("the autopilot skill is not auto-invoked by the model (AC 7.16.6)", () => {
  const skill = read(".claude/skills/qm-bundle-autopilot/SKILL.md");
  assert.match(skill, /^name: qm-bundle-autopilot$/m);
  assert.match(skill, /^disable-model-invocation: true$/m);
});
