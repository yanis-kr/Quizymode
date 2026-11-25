// Labels for a validated issue (#850, design E, AC 7.19.42 and 7.19.43). The validator records the result with
// `bundle.mjs validation`, then runs `bundle.mjs label-failure`, which applies exactly the plan below for the recorded
// outcome. GitHub is reached only through the injected gh function, so tests use a double.

import { execFileSync } from "node:child_process";
import { VALIDATION_OUTCOMES } from "./transitions.mjs";

export const FIX_CYCLE_MARKER = (n) => `<!-- qm-fix-cycle:${n} -->`;
const FIX_CYCLE_RE = /<!--\s*qm-fix-cycle:(\d+)\s*-->/g;

// Labels every failure takes off: the issue leaves this bundle and is not ready until the plan says so.
const LEAVE = (bundleId) => ["status:ready", "fix-forward", `bundle:${bundleId}`];

/**
 * The labels to add and remove for one outcome. bundle:<id> is removed on every failure; a closed issue keeps it as history.
 * recheck-once changes nothing: the re-check result is recorded and labelled next.
 */
export function failureLabelPlan(outcome, bundleId) {
  if (!VALIDATION_OUTCOMES.includes(outcome)) throw new Error(`unknown validation outcome '${outcome}'`);
  const leave = LEAVE(bundleId);
  switch (outcome) {
    case "closable": return { add: [], remove: ["fix-forward", "validation-failed"] };
    case "recheck-once": return { add: [], remove: [] };
    case "fix-forward": return { add: ["validation-failed", "status:ready", "fix-forward"], remove: [`bundle:${bundleId}`] };
    case "needs-attention": return { add: ["validation-failed", "needs-attention"], remove: leave };
    case "needs-refinement": return { add: ["status:needs-refinement"], remove: leave };
    default: return { add: ["validation-failed", "parked", "needs-attention", "owner:human"], remove: leave }; // park
  }
}

/** The fix cycles already used, from the hidden markers in the issue's comments: the highest n found, or 0. */
export function fixCycleFrom(comments) {
  let max = 0;
  for (const c of comments ?? []) {
    const body = typeof c === "string" ? c : String(c?.body ?? "");
    for (const m of body.matchAll(FIX_CYCLE_RE)) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** The marker the failure comment carries. A defect uses one fix cycle; a rollback keeps the budget. Null when no fix follows. */
export function nextFixCycleMarker(outcome, kind, fixCycle) {
  if (outcome !== "fix-forward") return null;
  return FIX_CYCLE_MARKER(kind === "rolled-back" ? fixCycle : fixCycle + 1);
}

function ghDefault(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const nameOf = (l) => (typeof l === "string" ? l : l?.name);

/** Creates a label when the repo lacks it. gh exits non-zero with "already exists" for an existing one: that is success. */
function ensureLabel(label, repoArgs, gh) {
  try { gh(["label", "create", label, ...repoArgs]); }
  catch (e) { if (!/already exists/i.test(String(e?.message ?? e))) throw e; }
}

/** Comments of an issue: from a saved `gh issue view --json comments` file content, or read through gh. */
export function readComments({ issue, repo, commentsJson, gh = ghDefault }) {
  const raw = commentsJson ?? gh(["issue", "view", String(issue), ...(repo ? ["--repo", repo] : []), "--json", "comments"]);
  const parsed = JSON.parse(raw || "[]");
  return Array.isArray(parsed) ? parsed : (parsed.comments ?? []);
}

/**
 * Applies a plan to one issue. Idempotent: only labels that are missing are added and only labels that are present are
 * removed, so a second run with the same plan writes nothing. Each added label is created first without --force, so an
 * existing label keeps its colour and description; gh's "already exists" error counts as success.
 */
export function applyFailureLabels({ issue, plan, repo, gh = ghDefault }) {
  const r = repo ? ["--repo", repo] : [];
  const view = JSON.parse(gh(["issue", "view", String(issue), ...r, "--json", "labels"]) || "{}");
  const current = new Set((view.labels ?? []).map(nameOf));
  const added = plan.add.filter((l) => !current.has(l));
  const removed = plan.remove.filter((l) => current.has(l));
  for (const l of added) ensureLabel(l, r, gh);
  if (added.length || removed.length) {
    gh(["issue", "edit", String(issue), ...r, ...added.flatMap((l) => ["--add-label", l]), ...removed.flatMap((l) => ["--remove-label", l])]);
  }
  return { issue, added, removed, changed: added.length + removed.length > 0 };
}
