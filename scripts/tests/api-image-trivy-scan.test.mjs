// CI scans the release API image with a pinned Trivy by digest and records the evidence (AC 7.11.33, #817).
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

const block = jobBlock("api-image");

test("AC 7.11.33: api-image scans the image after it is built, checked and pushed", () => {
  const build = block.indexOf("docker/build-push-action");
  const push = block.indexOf('docker push "$IMAGE"');
  const target = block.indexOf("id: scan_target");
  const scan = block.indexOf("aquasecurity/trivy-action@");
  assert.ok(build >= 0 && push > build, "build, then push");
  assert.ok(target > push && scan > target, "push, then resolve the target, then scan");
});

test("AC 7.11.33: the Trivy action is pinned to a commit SHA and a Trivy release", () => {
  assert.match(block, /aquasecurity\/trivy-action@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+/);
  assert.match(block, /version: v\d+\.\d+\.\d+\s/);
  assert.doesNotMatch(block, /trivy-action@(master|main|latest|v?\d+(\.\d+)*\s)/);
  assert.doesNotMatch(block, /version: (latest|main)/);
});

test("AC 7.11.33: the scan covers OS packages, dependencies and configuration at HIGH and CRITICAL", () => {
  assert.match(block, /scanners: vuln,misconfig/);
  assert.match(block, /vuln-type: os,library/);
  assert.match(block, /ignore-unfixed: true/);
  assert.match(block, /severity: HIGH,CRITICAL/);
  assert.match(block, /trivyignores: \.trivyignore/);
  assert.match(block, /TRIVY_IMAGE_CONFIG_SCANNERS: misconfig/);
});

test("AC 7.11.33: the scan target is the registry digest on main and the image ID on pull requests", () => {
  assert.match(block, /RepoDigests/);
  assert.match(block, /\^\$\{REPOSITORY\}@sha256:/);
  assert.match(block, /\{\{\.Id\}\}/);
});

test("AC 7.11.33: the job summary records the digest or image ID and the scanner DB timestamp", () => {
  assert.match(block, /trivy version .*--format json/);
  assert.match(block, /VulnerabilityDB\.UpdatedAt/);
  assert.match(block, /Vulnerability DB updated at/);
  assert.match(block, /\$\{SCAN_ID\}/);
  assert.match(block, /GITHUB_STEP_SUMMARY/);
  assert.match(block, /cache-dir: \$\{\{ github\.workspace \}\}\/\.cache\/trivy/);
  assert.match(block, /trivy version --cache-dir "\$\{GITHUB_WORKSPACE\}\/\.cache\/trivy" --format json/);
});

test("AC 7.11.33: the first rollout is report-only and one value turns on enforcement", () => {
  assert.match(block, /^ {6}TRIVY_ENFORCE: "false"$/m);
  assert.match(block, /continue-on-error: \$\{\{ env\.TRIVY_ENFORCE != 'true' \}\}/);
  assert.match(block, /exit-code: \$\{\{ env\.TRIVY_ENFORCE == 'true' && '1' \|\| '0' \}\}/);
  const target = block.slice(block.indexOf("id: scan_target"), block.indexOf("aquasecurity/trivy-action@"));
  assert.match(target, /continue-on-error: \$\{\{ env\.TRIVY_ENFORCE != 'true' \}\}/);
  assert.match(block, /if: steps\.scan_target\.outcome == 'success'/);
  assert.match(block, /::warning::The API image scan was skipped/);
  assert.equal((workflow.match(/TRIVY_ENFORCE: "/g) ?? []).length, 1, "the switch is defined once");
});

test("AC 7.11.33: .trivyignore exists, documents the exception format and has no active entries", () => {
  assert.ok(fs.existsSync(".trivyignore"), ".trivyignore exists");
  const text = fs.readFileSync(".trivyignore", "utf8");
  assert.match(text, /reason/i);
  assert.match(text, /exp:YYYY-MM-DD/);
  const active = text.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  for (const entry of active) {
    assert.match(entry, /^\S+ exp:\d{4}-\d{2}-\d{2}$/, `entry has an expiry: ${entry}`);
  }
});
