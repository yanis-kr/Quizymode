import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { checkWorkflow, extractRunBlocks } from "../ci/check-workflow-secret-output.mjs";

const workflowDir = new URL("../../.github/workflows/", import.meta.url);
const read = (name) => readFileSync(new URL(name, workflowDir), "utf8");
const deploy = read("deploy.yml");
const rollback = read("rollback.yml");

const hasTool = (tool) => spawnSync(tool, ["--version"], { encoding: "utf8" }).status === 0;
const canRun = hasTool("bash") && hasTool("jq");

// AC 7.11.20 fixtures: the shapes that leaked or broke before #779.
const FIXTURE_NO_REDIRECT = `jobs:
  j:
    steps:
      - name: Create
        run: |
          aws lightsail create-container-service-deployment \\
            --service-name s \\
            --containers "$CONTAINERS"
`;
const FIXTURE_SET_X = `jobs:
  j:
    steps:
      - name: Fetch
        run: |
          set -x
          aws lightsail get-container-service-deployments --service-name s --query 'deployments[0].containers.api.environment' --output json > /tmp/env.json
      - name: Clean
        if: always()
        run: rm -f /tmp/env.json
`;
const FIXTURE_CAT_ENV = `jobs:
  j:
    steps:
      - name: Show
        run: cat /tmp/env.json
      - name: Clean
        if: always()
        run: rm -f /tmp/env.json
`;
const FIXTURE_PLUS = `jobs:
  j:
    steps:
      - name: Read
        run: |
          aws lightsail get-container-service-deployments +            --service-name s +            --query 'deployments[0].state' +            --output text
`;
const FIXTURE_BAD_BASH = `jobs:
  j:
    steps:
      - name: Broken
        run: |
          if [ -f x ]; then
            echo hi
`;
const FIXTURE_QUERY_ENV = `jobs:
  j:
    steps:
      - name: Query
        run: |
          STATE=$(aws lightsail get-container-service-deployments --service-name s --query 'deployments[0].containers.api.environment' --output json)
`;

test("the checked-in workflows pass the secret-output guard", () => {
  for (const file of readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f))) {
    assert.deepEqual(checkWorkflow(read(file), file), [], `${file} should have no secret-output problems`);
  }
});

test("the guard fails a create call without a stdout redirect", () => {
  assert.match(checkWorkflow(FIXTURE_NO_REDIRECT).join("\n"), /create-container-service-deployment prints its response/);
});
test("the guard fails set -x, cat of the env file, and a query that selects the environment", () => {
  assert.match(checkWorkflow(FIXTURE_SET_X).join("\n"), /set -x/);
  assert.match(checkWorkflow(FIXTURE_CAT_ENV).join("\n"), /prints \/tmp\/env\.json/);
  assert.match(checkWorkflow(FIXTURE_QUERY_ENV).join("\n"), /get-container-service-deployments prints its response/);
});
test("the guard fails a stray + continuation (the pre-fix rollback.yml defect) and invalid bash", () => {
  assert.match(checkWorkflow(FIXTURE_PLUS).join("\n"), /stray "\+"/);
  if (hasTool("bash")) assert.match(checkWorkflow(FIXTURE_BAD_BASH).join("\n"), /bash -n/);
});
test("the guard fails when the env file is not removed by an if: always() step", () => {
  const withoutCleanup = FIXTURE_CAT_ENV.replace("rm -f /tmp/env.json", "echo done");
  assert.match(checkWorkflow(withoutCleanup).join("\n"), /not removed by an if: always\(\) step/);
});

test("both workflows remove the temporary env file in an if: always() step", () => {
  for (const text of [deploy, rollback]) {
    assert.match(text, /if: always\(\)\s+run: rm -f \/tmp\/env\.json/);
  }
});
test("rollback.yml has real backslash continuations and no stray +", () => {
  assert.doesNotMatch(rollback, /\s\+\s+--/);
  assert.match(rollback, /get-container-service-deployments \\\r?\n/);
});

// Runs a step's shell with a stub `aws` and returns the captured log, with runner commands (::add-mask::) removed
// because the Actions runner consumes those and never shows them.
function runStep(blockText, { awsMode, envJson }) {
  const dir = mkdtempSync(join(tmpdir(), "wf-guard-"));
  try {
    const posix = dir.replaceAll("\\", "/");
    const stub = `#!/usr/bin/env bash
case "$AWS_STUB_MODE" in
  ok) echo '{"containerService":{"containers":{"api":{"environment":{"Db__ConnectionString":"CANARY-SECRET-VALUE-0123456789"}}}}}'; exit 0 ;;
  api-error) echo "An error occurred (InvalidInputException) when calling the CreateContainerServiceDeployment operation: bad input CANARY-SECRET-VALUE-0123456789" >&2; exit 254 ;;
  param-error) echo "Parameter validation failed: Invalid value CANARY-SECRET-VALUE-0123456789" >&2; exit 252 ;;
  env) printf '%s' "$AWS_STUB_ENV_JSON"; exit 0 ;;
esac
`;
    writeFileSync(join(dir, "aws"), stub);
    chmodSync(join(dir, "aws"), 0o755);
    const text = blockText.replaceAll("/tmp/", `${posix}/`);
    if (envJson) writeFileSync(join(dir, "env.json"), envJson);
    const result = spawnSync("bash", ["-c", text], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        AWS_STUB_MODE: awsMode,
        AWS_STUB_ENV_JSON: envJson ?? "",
        IMAGE: "ghcr.io/example/app:abc",
      },
    });
    const log = `${result.stdout}\n${result.stderr}`;
    return { status: result.status, log, visible: log.split("\n").filter((l) => !l.startsWith("::add-mask::")).join("\n"), masks: log.split("\n").filter((l) => l.startsWith("::add-mask::")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const stepRun = (yaml, stepName) => {
  const at = yaml.indexOf(`- name: ${stepName}`);
  assert.ok(at >= 0, `step ${stepName} present`);
  return extractRunBlocks(yaml.slice(at)).at(0).text;
};
const CANARY_ENV = JSON.stringify({ Db__ConnectionString: "CANARY-SECRET-VALUE-0123456789", Mode: "Production", Flag: "true" });

for (const [label, yaml, stepName] of [
  ["deploy.yml", deploy, "Create LightSail deployment"],
  ["rollback.yml", rollback, "Restore previous API image"],
]) {
  test(`${label} create step never prints the environment (stub aws, success)`, { skip: !canRun }, () => {
    const out = runStep(stepRun(yaml, stepName), { awsMode: "ok", envJson: CANARY_ENV });
    assert.equal(out.status, 0, out.log);
    assert.doesNotMatch(out.log, /CANARY/);
    assert.doesNotMatch(out.log, /"environment"/);
  });
  test(`${label} create step prints only a sanitized error line (stub aws, API error)`, { skip: !canRun }, () => {
    const out = runStep(stepRun(yaml, stepName), { awsMode: "api-error", envJson: CANARY_ENV });
    assert.notEqual(out.status, 0);
    assert.doesNotMatch(out.log, /CANARY/);
    assert.match(out.log, /An error occurred \(InvalidInputException\) when calling the CreateContainerServiceDeployment operation/);
  });
  test(`${label} create step withholds a parameter-validation error (stub aws)`, { skip: !canRun }, () => {
    const out = runStep(stepRun(yaml, stepName), { awsMode: "param-error", envJson: CANARY_ENV });
    assert.notEqual(out.status, 0);
    assert.doesNotMatch(out.log, /CANARY/);
    assert.match(out.log, /details withheld/);
  });
}

for (const [label, yaml, stepName] of [
  ["deploy.yml", deploy, "Fetch environment variables from active deployment"],
  ["rollback.yml", rollback, "Read current environment"],
]) {
  test(`${label} fetch step masks secret-looking values and prints nothing else`, { skip: !canRun }, () => {
    const out = runStep(stepRun(yaml, stepName), { awsMode: "env", envJson: CANARY_ENV });
    assert.equal(out.status, 0, out.log);
    assert.doesNotMatch(out.visible, /CANARY/);
    assert.ok(out.masks.some((m) => m.includes("CANARY-SECRET-VALUE-0123456789")), "the secret value is masked");
    assert.ok(!out.masks.some((m) => /Production|true/.test(m)), "short flags stay readable");
  });
}
