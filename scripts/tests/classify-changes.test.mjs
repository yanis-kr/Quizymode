import test from "node:test";
import assert from "node:assert/strict";
import { classify, classifyFile, isVersionOnlyDiff } from "../ci/classify-changes.mjs";

const f = (path, versionOnly = false) => ({ path, versionOnly });

test("skills, prompts and docs change neither web nor api", () => {
  const s = classify([f(".claude/skills/qm-research/SKILL.md"), f("AGENTS.md"), f("docs/AC.md"), f("docs/user-guide/a.md")]);
  assert.deepEqual(s, { web: false, api: false, any: false });
});
test("web-only change", () => {
  assert.deepEqual(classify([f("src/Quizymode.Web/src/App.tsx"), f("playwright/e2e-ci/a.spec.ts")]), { web: true, api: false, any: true });
});
test("api-only change, including tests and openapi", () => {
  assert.deepEqual(classify([f("src/Quizymode.Api/Features/X.cs"), f("tests/Quizymode.Api.Tests/X.cs"), f("docs/openapi/quizymode-api.json")]), { web: false, api: true, any: true });
});
test("workflow and data changes run both", () => {
  assert.equal(classifyFile(".github/workflows/ci.yml").web, true);
  assert.equal(classifyFile("data/seed-dev/a.json").api, true);
});
test("unknown paths fail safe to both", () => {
  assert.deepEqual(classifyFile("infra/x.tf"), { web: true, api: true });
});
test("a version-only bump is ignored; a real props change is api", () => {
  assert.deepEqual(classify([f("Directory.Build.props", true), f("src/Quizymode.Web/package.json", true), f("docs/AC.md")]), { web: false, api: false, any: false });
  assert.deepEqual(classify([f("Directory.Build.props", false)]), { web: false, api: true, any: true });
});
test("isVersionOnlyDiff", () => {
  assert.equal(isVersionOnlyDiff("-  <QuizymodeVersion>1.0.0</QuizymodeVersion>\n+  <QuizymodeVersion>1.0.1</QuizymodeVersion>"), true);
  assert.equal(isVersionOnlyDiff('-  "version": "1.0.0",\n+  "version": "1.0.1",'), true);
  assert.equal(isVersionOnlyDiff('-  "version": "1.0.0",\n+  "version": "1.0.1",\n+  "x": 1'), false);
  assert.equal(isVersionOnlyDiff(""), false);
});

import { readFileSync } from "node:fs";
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replaceAll(String.fromCharCode(13), "");
const ci = read("../../.github/workflows/ci.yml");
const deploy = read("../../.github/workflows/deploy.yml");
const rollback = read("../../.github/workflows/rollback.yml");
const jobBlock = (text, job) => {
  const start = text.indexOf(`\n  ${job}:\n`);
  assert.ok(start >= 0, `job ${job} exists`);
  const next = text.slice(start + 1).search(/\n  [a-z0-9-]+:\n/);
  return text.slice(start, next < 0 ? undefined : start + 1 + next);
};

test("workflow gating: CI jobs are gated by the change scope", () => {
  for (const [job, flag] of [["frontend", "web"], ["frontend-tests", "web"], ["backend-tests", "api"], ["api-image", "api"], ["e2e", "any"]]) {
    const block = jobBlock(ci, job);
    assert.match(block, /needs: changes/, job);
    assert.ok(block.includes(`needs.changes.outputs.${flag} == 'true'`), job);
  }
  for (const job of ["automation-contract", "ac-gate", "cognito-presignup"]) {
    assert.doesNotMatch(jobBlock(ci, job), /needs\.changes/, `${job} always runs`);
  }
});

test("workflow gating: the required aggregate fails when the classifier fails", () => {
  const block = jobBlock(ci, "build-test-publish");
  assert.match(block, /needs: \[changes,/);
  assert.match(block, /\[ "\$\{CHANGES\}" = "success" \] \|\| exit 1/);
  assert.match(block, /"skipped"/);
  assert.match(block, /needs\.api-image\.result == 'success'/);
});

test("workflow gating: Deploy follows the scope and falls back to everything", () => {
  assert.match(jobBlock(deploy, "deploy-container"), /needs\.scope\.outputs\.api == 'true'/);
  assert.match(jobBlock(deploy, "build-ui"), /needs\.scope\.outputs\.web == 'true'/);
  assert.match(jobBlock(deploy, "deploy-ui"), /needs\.scope\.outputs\.web == 'true'/);
  assert.match(jobBlock(deploy, "prod-verify"), /needs\.scope\.outputs\.web == 'true' \|\| needs\.scope\.outputs\.api == 'true'/);
  assert.match(jobBlock(deploy, "scope"), /deploying everything/);
  assert.match(jobBlock(deploy, "prod-verify"), /Wait for the deployed version\n\s+if: \$\{\{ needs\.scope\.outputs\.web == 'true' \}\}/);
  assert.match(ci, /name: change-scope/);
});

test("workflow gating: Rollback says which SHA it needs", () => {
  assert.match(rollback, /API image/);
});
