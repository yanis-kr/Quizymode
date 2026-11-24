// Tests for #761 v2 design E (AC 7.19.35): two defect failures in one batch halt the next autopilot start. Temp folders only.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFECTS_TO_HALT, haltFile, haltNeeded, haltState, writeHalt } from "../bundle/halt.mjs";

// Every temp folder is removed when the file's tests finish, so repeated runs do not leave qm-halt-* folders behind.
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "qm-halt-")); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

// AC 7.19.35: one defect does not halt the autopilot; two in one batch do.
test("AC 7.19.35: one defect does not halt, two defects in one batch do", () => {
  assert.equal(DEFECTS_TO_HALT, 2);
  assert.equal(haltNeeded(0), false);
  assert.equal(haltNeeded(1), false);
  assert.equal(haltNeeded(2), true);
  assert.equal(haltNeeded(3), true);
});

// AC 7.19.35: a written halt is read back until the owner removes the file; no file means no halt.
test("AC 7.19.35: a written halt is read back, and removing the file clears it", () => {
  const q = tmp();
  assert.equal(haltState(q), null, "no file, no halt");
  writeHalt(q, { bundleId: "b-1", defects: [101, 102] });
  assert.equal(fs.existsSync(haltFile(q)), true);
  assert.deepEqual(haltState(q).defects, [101, 102]);
  fs.rmSync(haltFile(q));
  assert.equal(haltState(q), null, "removing the file clears the halt");
});

// AC 7.19.35: an unreadable halt file still halts; it is never ignored.
test("AC 7.19.35: an unreadable halt file still counts as a halt", () => {
  const q = tmp();
  fs.writeFileSync(haltFile(q), "not json");
  const h = haltState(q);
  assert.notEqual(h, null);
  assert.equal(h.unreadable, true);
});
