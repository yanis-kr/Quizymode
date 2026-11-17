import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deploy = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");

// AC 7.12.11 (#732): about 60 s of boot grace at a 10 s probe interval, so a slow boot on the nano node is not replaced.
test("deploy.yml gives the Lightsail health check 6 failed probes before replacing a node", () => {
  const block = deploy.match(/"healthCheck":\s*\{[^}]*\}/s);
  assert.ok(block, "healthCheck block present");
  assert.match(block[0], /"path":\s*"\/health"/);
  assert.match(block[0], /"intervalSeconds":\s*10/);
  assert.match(block[0], /"unhealthyThreshold":\s*6/);
});
