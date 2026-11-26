import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deploy = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Splits the `jobs:` section into { name: block } by the two-space indented job keys.
function jobs(yaml) {
  const section = yaml.slice(yaml.indexOf("\njobs:\n") + "\njobs:\n".length);
  const keys = [...section.matchAll(/^ {2}([A-Za-z0-9_-]+):\n/gm)];
  return Object.fromEntries(
    keys.map((key, i) => [key[1], section.slice(key.index, keys[i + 1]?.index ?? section.length)])
  );
}

// The job-level `if:` (four-space indent), with a folded block joined into one line.
function condition(block) {
  const match = block.match(/^ {4}if:[ \t]*(.*(?:\n {6,}.*)*)/m);
  return match ? match[1].replace(/^>-?/, "").replace(/\s+/g, " ").trim() : "";
}

const all = jobs(deploy);

test("AC 7.11.34 scope deploys only a successful push to this repository's main", () => {
  assert.equal(
    condition(all.scope),
    "${{ github.event.workflow_run.conclusion == 'success' " +
      "&& github.event.workflow_run.event == 'push' " +
      "&& github.event.workflow_run.head_branch == 'main' " +
      "&& github.event.workflow_run.head_repository.full_name == github.repository }}"
  );
});

test("AC 7.11.34 every other deploy job is skipped when scope is skipped", () => {
  const others = Object.entries(all).filter(([name]) => name !== "scope");
  assert.ok(others.length >= 4, "expected the deploy, build and verify jobs");
  for (const [name, block] of others) {
    assert.match(block, /^ {4}needs: (scope|\[scope, [^\]]+\])$/m, `${name} must need scope`);
    const expression = condition(block);
    // A status function overrides the default "skip when a dependency was skipped", so it must check scope itself.
    if (/\b(always|cancelled|failure|success)\(\)/.test(expression)) {
      assert.match(expression, /!cancelled\(\) && needs\.scope\.result == 'success' && /, `${name} must require scope success`);
      assert.doesNotMatch(expression, /\balways\(\)|\bfailure\(\)/, `${name} must not run after a failed gate`);
    }
  }
});

test("AC 7.11.34 only a run that passes the gate takes the shared deploy concurrency slot", () => {
  const block = deploy.slice(deploy.indexOf("\nconcurrency:\n"), deploy.indexOf("\njobs:\n"));
  const group = block.slice(block.indexOf("group:"), block.indexOf("cancel-in-progress:")).replace(/\s+/g, " ");
  const gate = condition(all.scope).replace(/^\$\{\{ | \}\}$/g, "");
  assert.equal(
    group.trim(),
    `group: >- \${{ (${gate}) && 'deploy' || format('deploy-ignored-{0}', github.run_id) }}`
  );
});

test("AC 7.11.34 workflow_run is the only trigger of Deploy", () => {
  const triggers = deploy.slice(deploy.indexOf("\non:\n"), deploy.indexOf("\nconcurrency:"));
  assert.deepEqual([...triggers.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ["workflow_run"]);
});
