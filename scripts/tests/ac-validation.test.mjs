// Tests for scripts/validation (AC 7.10). Run: node --test scripts/tests/ac-validation.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acIdsInTitle, findAcTests, parseAcMarkdown, parseIssueList } from "../validation/ac-lib.mjs";
import { checkAcs } from "../validation/ac-gate.mjs";
import { evidenceRows, flattenReport, isComplete, renderComment } from "../validation/ac-evidence.mjs";

const SAMPLE = `
## AC 9. Sample

### AC 9.1 Heading issue (#900)

- **AC 9.1.1** [User] [verify: e2e] Signed-in thing.
- **AC 9.1.2** [Admin] [verify: signed-in-prod-ui] (#901) Prod-only thing.
- **AC 9.1.3** [User] Untagged thing.

### AC 9.2 No heading issue

- **AC 9.2.1** [User] (#902) Tag at the end. [verify: unit]
- **AC 9.2.2** [User] [verify: manual] (#902) Unknown method.
- **AC 9.2.10** [User] [verify: api] (#902) Two-digit id.
`;

test("parseAcMarkdown reads id, method and the issues of the line and its heading", () => {
  const acs = parseAcMarkdown(SAMPLE);
  assert.deepEqual(acs.map((ac) => ac.id), ["9.1.1", "9.1.2", "9.1.3", "9.2.1", "9.2.2", "9.2.10"]);
  assert.equal(acs[0].method, "e2e");
  assert.deepEqual(acs[0].issues, [900]);
  assert.deepEqual(acs[1].issues, [901, 900]);
  assert.equal(acs[2].method, null);
  assert.equal(acs[3].method, "unit");
  assert.deepEqual(acs[3].issues, [902]);
});

test("acIdsInTitle matches whole ids only", () => {
  assert.deepEqual(acIdsInTitle("AC 7.8.4 @e2e the API accepts the identity"), ["7.8.4"]);
  assert.deepEqual(acIdsInTitle("AC 9.2.10 two digits"), ["9.2.10"]);
  assert.deepEqual(acIdsInTitle("covers AC 1.2.3 and AC 1.2.4."), ["1.2.3", "1.2.4"]);
  assert.deepEqual(acIdsInTitle("no id here"), []);
});

test("parseIssueList accepts numbers with or without #", () => {
  assert.deepEqual(parseIssueList("645, #646,x"), [645, 646]);
});

test("findAcTests finds titles of test, asUser and asAdmin calls in spec files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ac-gate-"));
  try {
    fs.writeFileSync(
      path.join(dir, "a.spec.ts"),
      `test("AC 9.1.1 does it", async () => {});\nasAdmin('AC 9.1.2 admin sees it', async () => {});\ntest.skip("AC 9.9.9 skipped", () => {});`,
    );
    fs.writeFileSync(path.join(dir, "helper.ts"), `test("AC 8.8.8 not a spec file", () => {});`);
    const found = findAcTests(dir);
    assert.deepEqual(Object.keys(found).sort(), ["9.1.1", "9.1.2", "9.9.9"]);
    assert.equal(found["9.1.2"][0].title, "AC 9.1.2 admin sees it");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checkAcs fails untagged, unknown-method and test-less ACs, and passes the rest", () => {
  const acs = parseAcMarkdown(SAMPLE);
  const rows = checkAcs(acs, { e2e: { "9.1.1": [{ file: "x.spec.ts", title: "AC 9.1.1 does it" }] }, "signed-in-prod-ui": {} });
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(byId["9.1.1"].ok, true);
  assert.match(byId["9.1.2"].problem, /playwright\/prod-verify/);
  assert.match(byId["9.1.3"].problem, /no \[verify/);
  assert.equal(byId["9.2.1"].ok, true);
  assert.match(byId["9.2.2"].problem, /unknown method "manual"/);
  assert.equal(byId["9.2.10"].ok, true);
});

const REPORT = {
  suites: [
    {
      file: "prod-verify/x.spec.ts",
      specs: [
        { title: "AC 9.1.1 does it", tests: [{ projectName: "e2e-ci", status: "expected" }] },
        {
          title: "AC 9.1.2 admin sees it",
          tests: [{ projectName: "prod-verify", status: "skipped", annotations: [{ type: "skip", description: "BLOCKED: no saved admin sign-in" }] }],
        },
      ],
      suites: [{ specs: [{ title: "AC 9.1.1 second check", tests: [{ projectName: "e2e-ci", status: "unexpected" }] }] }],
    },
  ],
};

test("flattenReport maps Playwright statuses and walks nested suites", () => {
  const tests = flattenReport(REPORT);
  assert.deepEqual(tests.map((t) => t.result), ["PASSED", "BLOCKED", "FAILED"]);
  assert.equal(tests[1].note, "BLOCKED: no saved admin sign-in");
});

test("evidenceRows: a failing test wins, a skipped test is BLOCKED, and nothing is passed by default", () => {
  const acs = parseAcMarkdown(SAMPLE);
  const rows = evidenceRows(acs, flattenReport(REPORT), "");
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.result]));
  assert.deepEqual(byId, { "9.1.1": "FAILED", "9.1.2": "BLOCKED", "9.1.3": "NOT RUN", "9.2.1": "NOT RUN", "9.2.2": "NOT RUN", "9.2.10": "NOT RUN" });
  assert.equal(isComplete(rows), false);
  assert.equal(isComplete([]), false);
});

test("evidenceRows: unit ACs point at the CI run when one is given, and a fully passing issue is complete", () => {
  const acs = parseAcMarkdown("- **AC 9.3.1** [User] [verify: e2e] (#903) A.\n- **AC 9.3.2** [User] [verify: unit] (#903) B.");
  const passing = { suites: [{ specs: [{ title: "AC 9.3.1 works", tests: [{ projectName: "e2e-ci", status: "expected" }] }] }] };
  const rows = evidenceRows(acs, flattenReport(passing), "https://example.test/run/1");
  assert.deepEqual(rows.map((row) => row.result), ["PASSED", "SEE CI"]);
  assert.equal(isComplete(rows), true);
  const comment = renderComment(903, rows, { env: "CI", runUrl: "https://example.test/run/1", commit: "abc" });
  assert.match(comment, /## Acceptance Evidence/);
  assert.match(comment, /\| AC 9\.3\.1 \| e2e \| PASSED \|/);
  assert.match(comment, /Every AC of this issue has evidence/);
});

test("renderComment escapes backslashes before pipes in table cells", () => {
  const comment = renderComment(1, [{ id: "9.9.9", method: "e2e", result: "PASSED", detail: String.raw`a\|b | c` }], {});
  assert.ok(comment.includes(String.raw`a\\\|b \| c`));
});
