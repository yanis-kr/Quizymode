import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
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

// AC 7.16.4 (amended by #762): BUNDLE junction builds the Windows junction from runtime paths; the playbook only names the command.
test("AC 7.16.4 BUNDLE junction links the lane's web node_modules to the main checkout's, from runtime paths, outside C:\Projects with a space", { skip: process.platform !== "win32" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qm 762 junction "));
  const main = path.join(tmp, "main checkout");
  const lane = path.join(tmp, "lane a");
  const git = (cwd, args) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], { cwd, encoding: "utf8" });
  fs.mkdirSync(main, { recursive: true });
  git(main, ["init", "-q", "-b", "main"]);
  git(main, ["commit", "-q", "--allow-empty", "-m", "base"]);
  fs.cpSync(path.join(repo, "scripts"), path.join(main, "scripts"), { recursive: true });
  const profile = JSON.parse(fs.readFileSync(path.join(repo, ".claude", "delivery-profile.json"), "utf8"));
  profile.worktrees.laneA = "lane a";
  fs.mkdirSync(path.join(main, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(main, ".claude", "delivery-profile.json"), JSON.stringify(profile, null, 2));
  fs.mkdirSync(path.join(main, "src", "Quizymode.Web", "node_modules"), { recursive: true });
  git(main, ["add", "-A"]);
  git(main, ["commit", "-q", "-m", "fixture"]);
  git(main, ["worktree", "add", "-q", lane, "-b", "lane-fixture"]);
  fs.mkdirSync(path.join(lane, "src", "Quizymode.Web"), { recursive: true });

  const helperInLane = path.join(lane, "scripts", "bundle", "bundle.mjs");
  const made = spawnSync("node", [helperInLane, "junction", "laneA"], { cwd: lane, encoding: "utf8" });
  assert.equal(made.status, 0, made.stdout + made.stderr);
  const out = JSON.parse(made.stdout);
  const link = path.join(lane, "src", "Quizymode.Web", "node_modules");
  const target = path.join(main, "src", "Quizymode.Web", "node_modules");
  assert.equal(fs.realpathSync.native(out.link), fs.realpathSync.native(link));
  assert.equal(fs.realpathSync.native(out.target), fs.realpathSync.native(target));
  assert.equal(fs.realpathSync.native(link), fs.realpathSync.native(target), "the lane's node_modules resolves to the main checkout's");

  const again = spawnSync("node", [helperInLane, "junction", "laneA"], { cwd: lane, encoding: "utf8" });
  assert.equal(again.status, 2, "an existing link is not replaced");

  const removed = spawnSync("node", [helperInLane, "junction", "laneA", "--remove"], { cwd: lane, encoding: "utf8" });
  assert.equal(removed.status, 0, removed.stdout + removed.stderr);
  assert.ok(fs.existsSync(target), "removing the link leaves the target untouched");
  assert.equal(fs.existsSync(link), false);
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
