import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const doc = read("docs/infra/SSM.md");
const CANARY = "CANARY-SSM-VALUE-0123456789";

function powershell() {
  for (const exe of ["pwsh", "powershell"]) {
    const probe = spawnSync(exe, ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) return exe;
  }
  return null;
}
const PS = powershell();

const fences = [...doc.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);

test("runbook covers naming, tier, IAM policy, KMS test, deploy path, read-back and rollback", () => {
  for (const needle of ["/quizymode/prod/<Section>/<Key>", "SecureString", "Standard", "quizymode-api-config", "ssm:GetParametersByPath", "kms:Decrypt", "/quizymode/deploy/", "ssm-list-parameters.ps1", "Rollback", "APP_Config__Ssm__Enabled=false"]) {
    assert.ok(doc.includes(needle), `missing: ${needle}`);
  }
  JSON.parse(fences.find((f) => f.trim().startsWith("{")));
});

test("no command in the runbook carries a value or decrypts values", () => {
  const secretAssign = /(secret|password|token|apikey|api_key|accesskey)[A-Za-z_]*\s*=\s*\S/i;
  for (const fence of fences) {
    for (const line of fence.split("\n")) {
      assert.ok(!/--value\b/.test(line), `value on command line: ${line}`);
      assert.ok(!secretAssign.test(line), `secret assignment: ${line}`);
      if (line.includes("--with-decryption")) assert.match(line, /--query 'Parameters\[\]\.Name'/, `decryption must only list names: ${line}`);
    }
  }
});

test("the parameter table matches the secret options the API reads", () => {
  const table = [...doc.matchAll(/^\| `\/quizymode\/prod\/([^`]+)` \|/gm)].map((m) => m[1]);
  const sources = {
    "Media/S3": read("src/Quizymode.Api/Features/Media/MediaOptions.cs"),
    "Email/Smtp": read("src/Quizymode.Api/Shared/Email/EmailOptions.cs"),
    GitHubSeedSync: read("src/Quizymode.Api/Shared/Options/GitHubSeedSyncOptions.cs"),
    GrafanaCloud: read("src/Quizymode.Api/Shared/Options/GrafanaCloudOptions.cs"),
  };
  const vendors = [...read("src/Quizymode.Api/Features/StudyGuideDocuments/Generation/LlmVendorRegistry.cs").matchAll(/public const string \w+ = "(\w+)";/g)].map((m) => m[1]);
  const expected = new Set(["ConnectionStrings/PostgreSQL", ...vendors.map((v) => `${v}/ApiKey`)]);
  for (const [section, source] of Object.entries(sources)) {
    for (const [, prop] of source.matchAll(/public string\? (\w*(?:Key|Secret|Password|Token)\w*)\s*\{/g)) {
      if (prop === "PrivateKeyBase64") continue;
      expected.add(`${section}/${prop}`);
    }
  }
  const grafana = sources.GrafanaCloud.match(/public string (ApiKey)\s*\{/);
  assert.ok(grafana, "GrafanaCloud ApiKey property expected");
  expected.add("GrafanaCloud/ApiKey");
  assert.deepEqual([...new Set(table)].sort(), [...expected].sort());
});

test("LIGHTSAIL.md links to the runbook", () => {
  assert.match(read("docs/infra/LIGHTSAIL.md"), /\]\(\.\/SSM\.md\)/);
});

const stubDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "ssm-test-"));
  const log = join(dir, "calls.log");
  const stub = join(dir, "aws-stub.ps1");
  writeFileSync(stub, `Add-Content -LiteralPath '${log}' -Value ($args -join ' ')\nif ($args -contains 'put-parameter') { Write-Output '7' } else { Write-Output "/quizymode/prod/Gemini/ApiKey\`tSecureString\`t7" }\nexit 0\n`);
  return { dir, log, stub };
};
const run = (script, args) => spawnSync(PS, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(process.cwd(), "scripts/ops", script), ...args], { encoding: "utf8" });
const skip = PS ? false : "no PowerShell available";

test("ssm-put-secret stores from a file without the value reaching arguments or output", { skip }, () => {
  const { dir, log, stub } = stubDir();
  try {
    const valueFile = join(dir, "value.txt");
    writeFileSync(valueFile, CANARY);
    const r = run("ssm-put-secret.ps1", ["-Name", "/quizymode/prod/Gemini/ApiKey", "-FromFile", valueFile, "-AwsCommand", stub]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\/quizymode\/prod\/Gemini\/ApiKey version 7/);
    const calls = readFileSync(log, "utf8");
    assert.ok(calls.includes("--type SecureString") && calls.includes("--overwrite") && calls.includes("file://"));
    for (const text of [calls, r.stdout, r.stderr]) assert.ok(!text.includes(CANARY));
    assert.ok(existsSync(valueFile), "the caller's file is left alone");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ssm-put-secret refuses names outside the allowed prefixes and empty values", { skip }, () => {
  const { dir, log, stub } = stubDir();
  try {
    const valueFile = join(dir, "value.txt");
    writeFileSync(valueFile, CANARY);
    for (const name of ["/other/Gemini/ApiKey", "/quizymode/prod/../x", "/quizymode/prod/", "quizymode/prod/x"]) {
      const r = run("ssm-put-secret.ps1", ["-Name", name, "-FromFile", valueFile, "-AwsCommand", stub]);
      assert.notEqual(r.status, 0, name);
    }
    const empty = join(dir, "empty.txt");
    writeFileSync(empty, "");
    assert.notEqual(run("ssm-put-secret.ps1", ["-Name", "/quizymode/prod/Gemini/ApiKey", "-FromFile", empty, "-AwsCommand", stub]).status, 0);
    assert.ok(!existsSync(log), "aws was never called");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ssm-list-parameters never decrypts and prints only name, type and version", { skip }, () => {
  const { dir, log, stub } = stubDir();
  try {
    const r = run("ssm-list-parameters.ps1", ["-AwsCommand", stub]);
    assert.equal(r.status, 0, r.stderr);
    const calls = readFileSync(log, "utf8");
    assert.ok(!calls.includes("--with-decryption"));
    assert.ok(calls.includes("Parameters[].[Name,Type,Version]"));
    assert.ok(!/\bValue\b/.test(r.stdout));
    assert.notEqual(run("ssm-list-parameters.ps1", ["-Path", "/other/", "-AwsCommand", stub]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
