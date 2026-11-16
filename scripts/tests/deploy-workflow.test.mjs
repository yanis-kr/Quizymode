import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deploy = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

test("deploy.yml reads the change scope without a jq default-to-true", () => {
  assert.doesNotMatch(deploy, /\/\/\s*true/);
  assert.match(deploy, /node scripts\/ci\/read-change-scope\.mjs/);
});
test("deploy-container checks the image tag before creating the deployment", () => {
  const check = deploy.indexOf("docker manifest inspect");
  const create = deploy.indexOf("Create LightSail deployment");
  assert.ok(check > 0, "image check present");
  assert.ok(check < create, "image check comes before the Lightsail deployment step");
});
test("a no-op scope writes the summary line using the workflow_run head sha", () => {
  assert.match(deploy, /Nothing to deploy for \$\{SHA\}/);
  assert.match(deploy, /SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
});
test("ci.yml runs every validation test file", () => {
  assert.match(ci, /node --test "scripts\/tests\/\*\.test\.mjs"/);
});
