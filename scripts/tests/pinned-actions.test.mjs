// Every action not published by GitHub (actions/*, github/*) is pinned to a 40-character commit SHA with its
// version in a comment (#906). Local actions (./...) and docker:// images are not third-party actions here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowsDir = path.join(repo, ".github", "workflows");

/** Problems with the `uses:` lines of one workflow text: each unpinned third-party action, with its line number. */
export function unpinnedActions(text, file = "workflow") {
  const problems = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const m = /^\s*(?:-\s+)?uses:\s*(['"]?)([^\s'"#]+)\1\s*(#.*)?$/.exec(line);
    if (!m) return;
    const ref = m[2];
    if (ref.startsWith("./") || ref.startsWith("docker://")) return;
    const owner = ref.split("/")[0].toLowerCase();
    if (owner === "actions" || owner === "github") return;
    const at = ref.lastIndexOf("@");
    const version = at < 0 ? "" : ref.slice(at + 1);
    if (!/^[0-9a-f]{40}$/.test(version)) problems.push(`${file}:${i + 1} ${ref} is not pinned to a 40-character commit SHA`);
    else if (!/^#\s*v?\d+(\.\d+){0,2}\b/.test(m[3] ?? "")) problems.push(`${file}:${i + 1} ${ref} has no version comment (# vX.Y.Z)`);
  });
  return problems;
}

test("AC #906 AC1: every third-party action in .github/workflows is pinned to a commit SHA with a version comment", () => {
  const files = fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0);
  const problems = files.flatMap((f) => unpinnedActions(fs.readFileSync(path.join(workflowsDir, f), "utf8"), f));
  assert.deepEqual(problems, []);
  // The workflows do use third-party actions, so the check is not vacuous.
  const thirdParty = files.flatMap((f) => fs.readFileSync(path.join(workflowsDir, f), "utf8").match(/uses:\s*(?!actions\/|github\/|\.\/)[\w.-]+\/[\w./-]+@/g) ?? []);
  assert.ok(thirdParty.length >= 5, `found ${thirdParty.length} third-party uses`);
});

test("AC #906 AC1: the contract fails on a tag, a branch, a short SHA or a missing version comment", () => {
  const sha = "f87e5991a6d7451dcb8d9637bfbc97413f497069";
  const bad = [
    "      - uses: docker/login-action@v4",
    "        uses: docker/login-action@master",
    "        uses: docker/login-action@f87e599",
    `        uses: docker/login-action@${sha}`,
    `        uses: "docker/login-action@v4.8.0"`,
    "        uses: aws-actions/configure-aws-credentials",
  ];
  for (const line of bad) assert.equal(unpinnedActions(line).length, 1, line);
  const good = [
    `        uses: docker/login-action@${sha} # v4.8.0`,
    "        uses: actions/checkout@v6",
    "      - uses: github/codeql-action/init@v4",
    "        uses: ./.github/actions/local",
    "        uses: docker://alpine:3.20",
  ];
  for (const line of good) assert.deepEqual(unpinnedActions(line), [], line);
});
