// A run superseded by a newer push reports its required checks as skipped, not failed (AC 7.19.18).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

// Returns the text of one top-level job block, from its "  <name>:" line to the next job.
function jobBlock(name) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.ok(start >= 0, `job ${name} exists`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [a-z][\w-]*:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

for (const job of ["build-test-publish", "release-ready"]) {
  test(`AC 7.19.18: ${job} is skipped on a cancelled run, not forced to run with always()`, () => {
    const block = jobBlock(job);
    assert.doesNotMatch(block, /if:\s*always\(\)/, `${job} must not use always()`);
    assert.match(block, /if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}/, `${job} uses !cancelled()`);
  });
}
