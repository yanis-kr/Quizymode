#!/usr/bin/env node
// The release-ready gate (AC 7.18.1). It runs in CI as the `release-ready` job with `needs` passed in as JSON. It fails
// unless every job it needs ended as success or skipped, so a single required check covers all of them.
//
//   NEEDS_JSON='{"build-test-publish":{"result":"success"}, ...}' node scripts/release/release-ready.mjs

export const RELEASE_READY_NEEDS = ["build-test-publish", "e2e", "ac-gate", "seed-quality", "automation-contract"];
const PASSING_RESULTS = ["success", "skipped"];

/** Returns { ok, failing } for the `needs` object of the release-ready job. A missing job counts as failing. */
export function releaseReady(needs) {
  const failing = RELEASE_READY_NEEDS.filter((name) => !PASSING_RESULTS.includes(needs?.[name]?.result));
  return { ok: failing.length === 0, failing };
}

function main() {
  let needs;
  try {
    needs = JSON.parse(process.env.NEEDS_JSON ?? "{}");
  } catch {
    console.error("release-ready: NEEDS_JSON is not valid JSON");
    return 1;
  }
  const verdict = releaseReady(needs);
  if (verdict.ok) {
    console.log("release-ready: every required job passed or was skipped");
    return 0;
  }
  console.error(`release-ready: these jobs did not pass: ${verdict.failing.join(", ")}`);
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith("release-ready.mjs")) {
  process.exitCode = main();
}
