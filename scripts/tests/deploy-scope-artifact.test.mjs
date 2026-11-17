import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// AC 7.11.18: the change-scope artifact must survive the scope reader's checkout (#730).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const deploy = fs.readFileSync(path.join(root, ".github", "workflows", "deploy.yml"), "utf8");

test("AC 7.11.18: the artifact is downloaded outside the checkout", () => {
  assert.match(deploy, /name: change-scope\s*\n\s*# Outside the checkout[^\n]*\n\s*path: \$\{\{ runner\.temp \}\}\/change-scope/);
});

test("AC 7.11.18: the reader reads the artifact from runner.temp, not the workspace", () => {
  assert.match(deploy, /SCOPE_FILE: \$\{\{ runner\.temp \}\}\/change-scope\/change-scope\.json/);
  assert.match(deploy, /-f "\$SCOPE_FILE"/);
  assert.match(deploy, /FILE="\$SCOPE_FILE"/);
});

test("AC 7.11.18: no step still looks for a bare change-scope.json in the workspace", () => {
  assert.doesNotMatch(deploy, /-f change-scope\.json/);
  assert.doesNotMatch(deploy, /FILE=change-scope\.json/);
});
