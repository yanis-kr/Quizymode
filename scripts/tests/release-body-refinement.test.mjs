// Scope decisions return an issue to refinement (AC 7.19.8); the release PR body only refers to issues (AC 7.19.9).
import test from "node:test";
import assert from "node:assert/strict";
import { returnToRefinement, CLAIM_MARKER } from "../bundle/claim.mjs";
import { releasePrBody, assertNoClosingKeywords } from "../release/prbody.mjs";

function fakeGh(issue) {
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(" "));
    if (args[1] === "edit") {
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--remove-label") issue.labels = issue.labels.filter((l) => l !== args[i + 1]);
        if (args[i] === "--add-label") issue.labels.push(args[i + 1]);
      }
      return "";
    }
    if (args[1] === "view") return JSON.stringify({ comments: issue.comments });
    if (args[1] === "comment") { issue.comments.push({ body: args[args.indexOf("--body") + 1] }); return ""; }
    throw new Error(`unexpected ${args.join(" ")}`);
  };
  return { gh, calls };
}

test("AC 7.19.8: a scope decision removes status:ready and the claim, adds status:needs-refinement and posts the question once", () => {
  const issue = { labels: ["status:ready", "bundle:b-1"], comments: [{ body: CLAIM_MARKER("b-1") }] };
  const { gh } = fakeGh(issue);
  const first = returnToRefinement({ bundleId: "b-1", issue: 753, question: "Trust X-Forwarded-For from the first hop only?", deps: { gh } });
  assert.equal(first.result, "returned");
  assert.equal(first.comment, "posted");
  assert.deepEqual(issue.labels.sort(), ["status:needs-refinement"]);
  const again = returnToRefinement({ bundleId: "b-1", issue: 753, question: "same", deps: { gh } });
  assert.equal(again.comment, "exists");
  assert.equal(issue.comments.filter((c) => c.body.includes("Scope decision needed")).length, 1);
});

test("AC 7.19.9: the release PR body refers to bundled issues as Refs and lists exclusions with reasons", () => {
  const body = releasePrBody({
    bundleId: "b-1",
    issues: [{ number: 753, title: "fix(security): trust" }, { number: 715, title: "feat(analytics): report" }],
    excluded: [{ number: 750, reason: "legal wording needs the owner" }],
  });
  assert.match(body, /^Refs #753 fix\(security\)/m);
  assert.match(body, /^Refs #715 /m);
  assert.match(body, /#750: legal wording needs the owner/);
  assert.equal(assertNoClosingKeywords(body), true);
});

test("AC 7.19.9: a body that would close an issue on merge is refused", () => {
  assert.throws(() => assertNoClosingKeywords("Closes #753\n"), /closes an issue on merge/);
  assert.throws(() => assertNoClosingKeywords("fixes #715\n"), /closes an issue on merge/);
});
