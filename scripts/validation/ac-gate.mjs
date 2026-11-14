#!/usr/bin/env node
// AC gate (AC 7.10.1 to 7.10.3): every AC in scope has a verification method, and every AC whose method is proven by a
// Playwright test has a test that names it.
//
//   node scripts/validation/ac-gate.mjs --changed origin/main   ACs added or edited since the merge base (CI on PRs)
//   node scripts/validation/ac-gate.mjs --issues 645,646        ACs that belong to these issues (release batch)
//   node scripts/validation/ac-gate.mjs --all                   every AC (report only; most old ACs are untagged)
//   --json prints the result as JSON. Exit code 1 when any AC in scope fails.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { METHODS, TEST_DIR_BY_METHOD, findAcTests, parseAcMarkdown, parseArgs, parseIssueList } from "./ac-lib.mjs";

const AC_PATH = "docs/AC.md";

/** Pure check. `testsByMethod` is { e2e: { "7.8.4": [...] }, "signed-in-prod-ui": {...} }. Returns one row per AC. */
export function checkAcs(acs, testsByMethod) {
  return acs.map((ac) => {
    const row = { id: ac.id, line: ac.line, method: ac.method, issues: ac.issues, ok: true, problem: null, tests: [] };
    if (!ac.method) {
      return { ...row, ok: false, problem: "no [verify: <method>] tag" };
    }
    if (!METHODS.includes(ac.method)) {
      return { ...row, ok: false, problem: `unknown method "${ac.method}" (use one of: ${METHODS.join(", ")})` };
    }
    const dir = TEST_DIR_BY_METHOD[ac.method];
    if (!dir) return row;
    const tests = testsByMethod[ac.method]?.[ac.id] ?? [];
    if (tests.length === 0) {
      return { ...row, ok: false, problem: `no test under ${dir} has "AC ${ac.id}" in its title` };
    }
    return { ...row, tests };
  });
}

/** AC ids on lines added or edited in docs/AC.md between the merge base with `base` and the working tree. */
export function changedAcIds(base, cwd) {
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const mergeBase = git(["merge-base", base, "HEAD"]).trim();
  const diff = git(["diff", "-U0", mergeBase, "--", AC_PATH]);
  const added = diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
  return new Set(parseAcMarkdown(added).map((ac) => ac.id));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root === undefined || args.root === true ? process.cwd() : args.root);
  const all = parseAcMarkdown(fs.readFileSync(path.join(root, AC_PATH), "utf8"));

  let scope;
  let scopeLabel;
  if (args.changed) {
    const ids = changedAcIds(args.changed === true ? "origin/main" : args.changed, root);
    scope = all.filter((ac) => ids.has(ac.id));
    scopeLabel = `ACs added or edited since ${args.changed === true ? "origin/main" : args.changed}`;
  } else if (args.issues) {
    const issues = parseIssueList(args.issues);
    scope = all.filter((ac) => ac.issues.some((n) => issues.includes(n)));
    scopeLabel = `ACs of issues ${issues.map((n) => `#${n}`).join(", ")}`;
    const missing = issues.filter((n) => !scope.some((ac) => ac.issues.includes(n)));
    if (missing.length > 0) {
      console.error(`No AC in ${AC_PATH} names ${missing.map((n) => `#${n}`).join(", ")}. Add "(#<issue>)" to its ACs.`);
      process.exit(1);
    }
  } else if (args.all) {
    scope = all;
    scopeLabel = "all ACs";
  } else {
    console.error("Usage: ac-gate.mjs (--changed <base> | --issues <n,n> | --all) [--json] [--root <dir>]");
    process.exit(2);
  }

  const testsByMethod = Object.fromEntries(
    Object.entries(TEST_DIR_BY_METHOD).map(([method, dir]) => [method, findAcTests(path.join(root, dir))]),
  );
  const rows = checkAcs(scope, testsByMethod);
  const failed = rows.filter((row) => !row.ok);

  if (args.json) {
    console.log(JSON.stringify({ scope: scopeLabel, checked: rows.length, failed: failed.length, rows }, null, 2));
  } else {
    console.log(`AC gate: ${scopeLabel}: ${rows.length} checked, ${failed.length} failed.`);
    for (const row of failed) console.log(`  FAIL AC ${row.id} (${AC_PATH}:${row.line}): ${row.problem}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
