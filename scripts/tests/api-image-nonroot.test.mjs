// The release API image runs as the non-root user 1654 and CI checks it before the push (AC 7.11.32, #816).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dockerfile = fs.readFileSync("src/Quizymode.Api/Dockerfile", "utf8");
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

test("AC 7.11.32: the final Dockerfile stage switches to UID 1654 after copying the published files", () => {
  const finalStage = dockerfile.slice(dockerfile.indexOf("AS final"));
  assert.ok(finalStage.length > 0, "final stage exists");
  const lines = finalStage.split(/\r?\n/).map((line) => line.trim());
  const userLines = lines.filter((line) => /^USER\s/.test(line));
  assert.deepEqual(userLines, ["USER 1654:1654"]);
  const copyIndex = lines.findIndex((line) => line.startsWith("COPY --from=publish"));
  const userIndex = lines.indexOf("USER 1654:1654");
  const entrypointIndex = lines.findIndex((line) => line.startsWith("ENTRYPOINT"));
  assert.ok(copyIndex >= 0 && copyIndex < userIndex, "USER comes after the COPY");
  assert.ok(userIndex < entrypointIndex, "USER comes before the ENTRYPOINT");
});

test("AC 7.11.32: api-image checks the runtime UID before it pushes the image", () => {
  const block = jobBlock("api-image");
  const build = block.indexOf("docker/build-push-action");
  const check = block.indexOf("docker run --rm --entrypoint id");
  const push = block.indexOf('docker push "$IMAGE"');
  assert.ok(build >= 0 && check > build && push > check, "build, then UID check, then push");
  assert.match(block, /load: true/);
  assert.match(block, /push: false/);
  assert.match(block, /!= "1654"/);
  assert.match(block, /exit 1/);
});
