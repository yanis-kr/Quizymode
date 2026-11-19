import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// #785: infra/lightsail/env.prod.json holds only non-secret settings. Secrets come from SSM at runtime, and the two
// SSM bootstrap values are added by the deploy and rollback workflows from SSM, never from this file.
const SECRET_LIKE = /key|secret|password|token|connectionstring/i;
const ALLOW_LIST = new Set(["APP_Config__Ssm__Prefix"]);

/** Returns the problems with a Lightsail environment object; empty when it is acceptable. */
export function envFileProblems(env) {
  const problems = [];
  if (env === null || typeof env !== "object" || Array.isArray(env)) return ["the file must be a flat JSON object"];
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string") problems.push(`${name} must be a string`);
    if (SECRET_LIKE.test(name) && !ALLOW_LIST.has(name)) problems.push(`${name} looks like a secret`);
  }
  return problems;
}

const envFile = JSON.parse(readFileSync(new URL("../../infra/lightsail/env.prod.json", import.meta.url), "utf8"));

test("infra/lightsail/env.prod.json is a flat object of string values with no secret-looking names", () => {
  assert.deepEqual(envFileProblems(envFile), []);
});

test("the env file includes the non-secret settings the API needs", () => {
  for (const name of ["ASPNETCORE_ENVIRONMENT", "APP_Authentication__Cognito__Authority", "APP_Config__Ssm__Enabled", "APP_Config__Ssm__Region"]) {
    assert.ok(name in envFile, `${name} present`);
  }
});

test("the env file does not hold the SSM bootstrap pair (the workflows add it from SSM)", () => {
  assert.ok(!("APP_Config__Ssm__AccessKeyId" in envFile));
  assert.ok(!("APP_Config__Ssm__SecretAccessKey" in envFile));
});

test("the checker fails a fixture that adds a secret-looking name", () => {
  assert.match(envFileProblems({ ...envFile, Foo__ApiKey: "x" }).join("\n"), /Foo__ApiKey looks like a secret/);
});

test("the checker fails a non-string value", () => {
  assert.match(envFileProblems({ Mode: 1 }).join("\n"), /Mode must be a string/);
});
