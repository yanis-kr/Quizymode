// Visible claims and once-only comments for the ship run (#761, AC 7.19.6 and 7.19.7). gh is a stateful test double.
import test from "node:test";
import assert from "node:assert/strict";
import { claimIssues, postOnce, CLAIM_MARKER } from "../bundle/claim.mjs";

function fakeGitHub(issues) {
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(" "));
    if (args[0] === "label" && args[1] === "create") return "";
    const [, verb, numStr] = args;
    const issue = issues[numStr];
    if (args[0] !== "issue") throw new Error(`unexpected gh ${args.join(" ")}`);
    if (verb === "view") {
      const fields = args[args.indexOf("--json") + 1].split(",");
      const out = {};
      if (fields.includes("labels")) out.labels = issue.labels.map((name) => ({ name }));
      if (fields.includes("comments")) out.comments = issue.comments;
      if (fields.includes("state")) out.state = issue.state;
      return JSON.stringify(out);
    }
    if (verb === "edit") {
      const add = args.indexOf("--add-label");
      const rem = args.indexOf("--remove-label");
      if (add >= 0) issue.labels.push(args[add + 1]);
      if (rem >= 0) issue.labels = issue.labels.filter((l) => l !== args[rem + 1]);
      if (issue.onAdd) issue.onAdd(issue);
      return "";
    }
    if (verb === "comment") {
      issue.comments.push({ body: args[args.indexOf("--body") + 1] });
      return "";
    }
    throw new Error(`unexpected verb ${verb}`);
  };
  return { gh, calls };
}

function issue(overrides = {}) {
  return { state: "OPEN", labels: ["status:ready"], comments: [], ...overrides };
}

test("AC 7.19.6: claim adds bundle:<id> and one claim comment to a status:ready issue", () => {
  const issues = { 753: issue() };
  const { gh } = fakeGitHub(issues);
  const r = claimIssues({ bundleId: "b-1", issues: [753], deps: { gh } });
  assert.equal(r.ok, true);
  assert.equal(r.results[0].result, "claimed");
  assert.ok(issues[753].labels.includes("bundle:b-1"));
  assert.equal(issues[753].comments.length, 1);
  assert.ok(issues[753].comments[0].body.includes(CLAIM_MARKER("b-1")));
});

test("AC 7.19.6: an issue claimed by another bundle is refused and nothing is written", () => {
  const issues = { 753: issue({ labels: ["status:ready", "bundle:b-other"] }) };
  const { gh } = fakeGitHub(issues);
  const r = claimIssues({ bundleId: "b-1", issues: [753], deps: { gh } });
  assert.equal(r.ok, false);
  assert.equal(r.results[0].result, "refused");
  assert.equal(r.results[0].holder, "b-other");
  assert.equal(issues[753].comments.length, 0);
  assert.equal(issues[753].labels.includes("bundle:b-1"), false);
});

test("AC 7.19.6: an issue that is not status:ready or not open is refused", () => {
  const issues = { 1: issue({ labels: [] }), 2: issue({ state: "CLOSED" }) };
  const { gh } = fakeGitHub(issues);
  const r = claimIssues({ bundleId: "b-1", issues: [1, 2], deps: { gh } });
  assert.deepEqual(r.results.map((x) => x.result), ["refused", "refused"]);
  assert.equal(issues[1].comments.length, 0);
});

test("AC 7.19.6: a lost claim race is rolled back and refused", () => {
  const issues = { 753: issue({ onAdd: (i) => i.labels.push("bundle:b-rival") }) };
  const { gh } = fakeGitHub(issues);
  const r = claimIssues({ bundleId: "b-1", issues: [753], deps: { gh } });
  assert.equal(r.results[0].result, "refused");
  assert.match(r.results[0].reason, /lost the claim race/);
  assert.equal(issues[753].labels.includes("bundle:b-1"), false);
  assert.equal(issues[753].comments.length, 0);
});

test("AC 7.19.7: a restarted run that already holds the claim writes nothing new", () => {
  const issues = { 753: issue({ labels: ["status:ready", "bundle:b-1"], comments: [{ body: CLAIM_MARKER("b-1") }] }) };
  const { gh, calls } = fakeGitHub(issues);
  const r = claimIssues({ bundleId: "b-1", issues: [753], deps: { gh } });
  assert.equal(r.results[0].result, "resumed");
  assert.equal(issues[753].comments.length, 1);
  assert.equal(calls.some((c) => c.startsWith("issue edit") || c.startsWith("issue comment")), false);
});

test("AC 7.19.7: postOnce posts a closure comment once per issue and bundle", () => {
  const issues = { 753: issue() };
  const { gh } = fakeGitHub(issues);
  assert.equal(postOnce({ bundleId: "b-1", issue: 753, marker: "evidence", body: "evidence A", deps: { gh } }).result, "posted");
  assert.equal(postOnce({ bundleId: "b-1", issue: 753, marker: "evidence", body: "evidence A", deps: { gh } }).result, "exists");
  assert.equal(issues[753].comments.length, 1);
  assert.equal(postOnce({ bundleId: "b-2", issue: 753, marker: "evidence", body: "evidence B", deps: { gh } }).result, "posted");
});

test("AC 7.19.15: the bundle label is created in the repo before any issue is labelled", () => {
  const issues = { 753: issue() };
  const { gh, calls } = fakeGitHub(issues);
  claimIssues({ bundleId: "b-new", issues: [753], deps: { gh } });
  const createAt = calls.findIndex((c) => c === "label create bundle:b-new --color 1D76DB --description Claimed by bundle b-new --force");
  const editAt = calls.findIndex((c) => c.startsWith("issue edit 753 --add-label"));
  assert.ok(createAt >= 0, "label create with --force is called");
  assert.ok(createAt < editAt, "label is created before the issue is labelled");
  assert.ok(issues[753].labels.includes("bundle:b-new"));
});

test("AC 7.19.15: creating an existing bundle label is idempotent (--force), so a second claim run still succeeds", () => {
  const issues = { 753: issue({ labels: ["status:ready", "bundle:b-1"] }) };
  const { gh, calls } = fakeGitHub(issues);
  const r = claimIssues({ bundleId: "b-1", issues: [753], deps: { gh } });
  assert.equal(r.results[0].result, "resumed");
  assert.ok(calls.some((c) => c.startsWith("label create bundle:b-1") && c.endsWith("--force")));
});
