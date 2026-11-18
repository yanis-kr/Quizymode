// Visible claims for the ship skill (#761, AC 7.19.6 and 7.19.7). A claim is the label `bundle:<id>` on the issue plus one
// claim comment with a marker line. Re-running a claim for the same bundle changes nothing on GitHub, so a restarted run
// never duplicates a claim. No GitHub calls happen here except through deps.gh, so tests use a double.

import { execFileSync } from "node:child_process";

export const CLAIM_MARKER = (bundleId) => `<!-- qm-claim:${bundleId} -->`;
export const BUNDLE_LABEL_PREFIX = "bundle:";

function ghDefault(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function ghJson(args, deps) {
  const out = (deps.gh ?? ghDefault)(args);
  return out ? JSON.parse(out) : null;
}

function bundleLabelsOf(labels) {
  return labels.map((l) => l.name).filter((n) => n.startsWith(BUNDLE_LABEL_PREFIX));
}

/**
 * Claims each issue for bundleId. Returns { ok, results } where each result is one of:
 *   claimed      the label and claim comment were added now
 *   resumed      this bundle already holds the claim; nothing was written
 *   refused      another bundle holds the claim, or the issue is not status:ready; nothing was written
 * A claim that loses a race (another bundle's label is present after the write) is rolled back and refused.
 */
export function claimIssues({ bundleId, issues, deps = {} }) {
  const label = `${BUNDLE_LABEL_PREFIX}${bundleId}`;
  const results = [];
  for (const issue of issues) {
    const view = ghJson(["issue", "view", String(issue), "--json", "labels,comments,state"], deps) ?? {};
    if (view.state && view.state !== "OPEN") {
      results.push({ issue, result: "refused", reason: `issue is ${view.state}` });
      continue;
    }
    const names = (view.labels ?? []).map((l) => l.name);
    const others = bundleLabelsOf(view.labels ?? []).filter((n) => n !== label);
    if (others.length) {
      results.push({ issue, result: "refused", reason: `already claimed by ${others.join(", ")}`, holder: others[0].slice(BUNDLE_LABEL_PREFIX.length) });
      continue;
    }
    if (names.includes(label)) {
      results.push({ issue, result: "resumed", reason: "this bundle already holds the claim" });
      continue;
    }
    if (!names.includes("status:ready")) {
      results.push({ issue, result: "refused", reason: "issue is not status:ready" });
      continue;
    }
    (deps.gh ?? ghDefault)(["issue", "edit", String(issue), "--add-label", label]);
    // Re-read after the write: if another bundle's label is now present too, the other claim won the race; back off.
    const after = ghJson(["issue", "view", String(issue), "--json", "labels"], deps) ?? {};
    const rivals = bundleLabelsOf(after.labels ?? []).filter((n) => n !== label);
    if (rivals.length) {
      (deps.gh ?? ghDefault)(["issue", "edit", String(issue), "--remove-label", label]);
      results.push({ issue, result: "refused", reason: `lost the claim race to ${rivals.join(", ")}`, holder: rivals[0].slice(BUNDLE_LABEL_PREFIX.length) });
      continue;
    }
    (deps.gh ?? ghDefault)(["issue", "comment", String(issue), "--body", `${CLAIM_MARKER(bundleId)}\nClaimed by bundle \`${bundleId}\`. The ship run will design, implement, review and validate this issue, then close it with evidence.`]);
    results.push({ issue, result: "claimed" });
  }
  return { ok: results.every((r) => r.result !== "refused"), results };
}

/**
 * Posts a closing or evidence comment at most once per issue for a bundle (AC 7.19.7): the marker line is checked first.
 */
export function postOnce({ bundleId, issue, marker, body, deps = {} }) {
  const token = `<!-- qm-${marker}:${bundleId} -->`;
  const view = ghJson(["issue", "view", String(issue), "--json", "comments"], deps) ?? {};
  if ((view.comments ?? []).some((c) => String(c.body ?? "").includes(token))) return { issue, result: "exists" };
  (deps.gh ?? ghDefault)(["issue", "comment", String(issue), "--body", `${token}\n${body}`]);
  return { issue, result: "posted" };
}
