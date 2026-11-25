// The batch gate on the release branch (#850, design A and D, AC 7.19.44). It runs once the issues are integrated and before
// the release PR opens, and again after any later push. It checks the version bump and its mirror, the AC gate over every
// integrated issue, that each integrated branch is merged into the release branch, and that a live PR body closes nothing.
// Full test suites are not run here: CI release-ready runs them on the PR. Every git, gh and node call is injected.

import { assertNoClosingKeywords } from "../release/prbody.mjs";

const BUMPS = ["patch", "minor", "major"];

/** base bumped by one level: patch 1.2.3 -> 1.2.4, minor -> 1.3.0, major -> 2.0.0. Null when base is not x.y.z. */
export function bumpVersion(base, level) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(base ?? "").trim());
  if (!m) return null;
  const [maj, min, pat] = m.slice(1).map(Number);
  if (level === "major") return `${maj + 1}.0.0`;
  if (level === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/** The versions the release may carry: the manifest's bump, or a larger one (a feature raises patch to minor). */
export function allowedVersions(base, versionBump) {
  return BUMPS.slice(Math.max(0, BUMPS.indexOf(versionBump))).map((l) => bumpVersion(base, l)).filter(Boolean);
}

/** QuizymodeVersion (or another property) from Directory.Build.props text. */
export function propsVersion(text, property) {
  const m = new RegExp(`<${property}>\\s*([^<\\s]+)\\s*</${property}>`).exec(String(text ?? ""));
  return m ? m[1] : null;
}
/** The "version" field of a package.json text. */
export function packageVersion(text) {
  try { return JSON.parse(String(text ?? "")).version ?? null; } catch { return null; }
}

/**
 * Pure: the problems with one release head, each a sentence that names what to fix. Empty means the gate is open.
 * facts: { head, worktree: { path, head, dirty } | null, versionBump, baseVersion, releaseVersion, mirrors: [{ file, version }],
 *          acGate: { ok, detail }, unmerged: [{ issue, branch }], pr: { body, error } }
 */
export function batchGateErrors(facts) {
  const errors = [];
  // ac-gate runs in the release worktree, so that worktree must be the release head with nothing uncommitted.
  const wt = facts.worktree;
  if (!wt) errors.push("worktree: the release worktree is missing; create it with bundle.mjs worktrees --ensure <id> or pass --worktree");
  else {
    if (wt.head !== facts.head) errors.push(`worktree: ${wt.path} is at ${String(wt.head ?? "(unknown)").slice(0, 8)}, not the release head ${String(facts.head).slice(0, 8)}`);
    if (wt.dirty) errors.push(`worktree: ${wt.path} has uncommitted changes; commit or remove them first`);
  }
  const allowed = allowedVersions(facts.baseVersion, facts.versionBump);
  if (!allowed.length) errors.push(`version: cannot read the version on origin/main ('${facts.baseVersion ?? ""}')`);
  else if (!allowed.includes(facts.releaseVersion)) errors.push(`version: release branch has '${facts.releaseVersion ?? "(none)"}'; a ${facts.versionBump} bump over ${facts.baseVersion} is ${allowed[0]}`);
  for (const m of facts.mirrors ?? []) {
    if (m.version !== facts.releaseVersion) errors.push(`version: ${m.file} has '${m.version ?? "(none)"}', not ${facts.releaseVersion}`);
  }
  if (!facts.acGate?.ok) errors.push(`ac-gate: failed for the integrated issues${facts.acGate?.detail ? `: ${facts.acGate.detail}` : ""}`);
  for (const u of facts.unmerged ?? []) errors.push(`merge: #${u.issue} ${u.branch ? `branch ${u.branch} is not merged into the release branch` : "has no branch recorded"}`);
  if (facts.pr?.error) errors.push(`pr body: ${facts.pr.error}`);
  else if (typeof facts.pr?.body === "string") {
    try { assertNoClosingKeywords(facts.pr.body); } catch (e) { errors.push(`pr body: ${e.message}`); }
  }
  return errors;
}

/**
 * Gathers the facts for batchGateErrors. deps: readFile(ref, file) -> text|null, runAcGate(issueNumbers) -> { ok, detail },
 * isAncestor(branch, releaseBranch) -> boolean, worktree() -> { path, head, dirty } | null,
 * pr() -> { body: string|null } (body null: no PR yet) or { error } when gh could not read it.
 */
export function gatherGateFacts({ manifest, state, version, head, deps }) {
  const release = manifest.branches.release;
  const integrated = Object.entries(state.issues).filter(([, v]) => v.status === "integrated").map(([n, v]) => ({ issue: Number(n), branch: v.branch }));
  const releaseVersion = propsVersion(deps.readFile(release, version.file), version.property);
  return {
    head,
    worktree: deps.worktree(),
    integrated: integrated.map((i) => i.issue),
    versionBump: manifest.versionBump,
    baseVersion: propsVersion(deps.readFile(`origin/${manifest.source.baseBranch}`, version.file), version.property),
    releaseVersion,
    mirrors: (version.mirrors ?? []).map((file) => ({ file, version: packageVersion(deps.readFile(release, file)) })),
    acGate: integrated.length ? deps.runAcGate(integrated.map((i) => i.issue)) : { ok: false, detail: "no integrated issue" },
    unmerged: integrated.filter((i) => !i.branch || !deps.isAncestor(i.branch, release)),
    pr: deps.pr(),
  };
}

/** Why a recorded gate does not cover this head, or null when it does. */
export function gateRecordError(record, head) {
  if (!record) return "no batch gate is recorded; run bundle.mjs batch-gate first";
  if (!record.ok) return "the last batch gate failed; fix it and run batch-gate again";
  if (!head || record.head !== head) return `the batch gate ran on ${String(record.head).slice(0, 8)}, but the release head is ${String(head ?? "(unknown)").slice(0, 8)}; run batch-gate again`;
  return null;
}
