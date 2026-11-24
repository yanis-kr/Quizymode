// Tests for #761 v2 gaps 12 and 2 (AC 7.19.36 and 7.19.37). Pure checks; the CLI call only reads the allow list.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reviewerProblem } from "../bundle/review.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// AC 7.19.36: a standing approval needs a review record that names a reviewer other than the approving session.
test("AC 7.19.36: a review must name its reviewer, and the approving session cannot review its own manifest", () => {
  assert.match(reviewerProblem({ openFindings: [] }, "sess-approve"), /must name its reviewer/);
  assert.match(reviewerProblem({ openFindings: [], reviewer: { sessionId: "  " } }, "sess-approve"), /must name its reviewer/);
  assert.match(reviewerProblem({ openFindings: [], reviewer: { sessionId: "sess-approve" } }, "sess-approve"), /approving session/);
  assert.equal(reviewerProblem({ openFindings: [], reviewer: { sessionId: "sess-review" } }, "sess-approve"), null);
  assert.equal(reviewerProblem({ openFindings: [], reviewer: { sessionId: "sess-review" } }, null), null, "no approving session known: only the name is checked");
});

// AC 7.19.37: runs can call `bundle.mjs select` without a prompt: the printed allow list covers it.
test("AC 7.19.37: the printed allow list covers bundle.mjs select", () => {
  const out = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "scripts", "bundle", "bundle.mjs"), "permissions", "x"], { encoding: "utf8" }));
  const toRegex = (rule) => new RegExp("^" + rule.replace(/^Bash\((.*)\)$/, "$1").split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  const probe = "node scripts/bundle/bundle.mjs select --issues-file list.json";
  assert.ok(out.allow.some((rule) => rule.startsWith("Bash(") && toRegex(rule).test(probe)), "no printed rule matches select");
});
