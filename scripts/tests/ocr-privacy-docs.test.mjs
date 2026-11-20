import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const policy = fs.readFileSync(path.join(root, "docs/legal/quizymode-privacy-policy.md"), "utf8");
const acceptanceCriteria = fs.readFileSync(path.join(root, "docs/AC.md"), "utf8");

test("AC 6.6.48: privacy policy explains local OCR and text submission", () => {
  assert.match(policy, /Photos and scanned PDFs are processed for text recognition locally in your browser\./);
  assert.match(policy, /Original images are not uploaded to QuizyMode or sent to third-party OCR services\./);
  assert.match(policy, /You can review and edit the recognized text before submitting it\./);
  assert.match(policy, /The same study-guide retention policy applies\./);
  assert.match(acceptanceCriteria, /AC 6\.6\.48.*\(#748, #750\).*no file part.*no original image bytes are sent/s);
});
