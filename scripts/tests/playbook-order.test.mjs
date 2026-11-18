// The ship playbook states the release merge order (AC 7.19.12).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("AC 7.19.12: playbook states the reviewer pass, then arm, and disarm before a fix push", () => {
  const text = fs.readFileSync(".claude/skills/qm-bundle-ship/references/playbook.md", "utf8");
  assert.match(text, /record-review/);
  assert.match(text, /Arm: `release\.mjs ship --pr/);
  assert.match(text, /Before any fix push[\s\S]*disarm/);
  assert.ok(text.indexOf("record-review") < text.indexOf("Arm: `release.mjs ship --pr"), "reviewer pass comes before arm");
});
