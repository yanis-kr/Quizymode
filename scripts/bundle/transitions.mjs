// Issue status rules and the release slot for bundles (#761 v2, design F3 and F4).
// Pure helpers: bundle.mjs enforces them, and the rehearsal tests import them.
import fs from "node:fs";
import path from "node:path";

export const ISSUE_STATUSES = ["pending", "in_progress", "implemented", "validated", "integrated", "released", "verified", "closed", "blocked", "deferred", "parked", "skipped_already_done", "failed", "validation_failed"];

// The allowed moves between issue statuses. Re-writing the same status is always allowed (notes, retries).
export const ISSUE_TRANSITIONS = {
  pending: ["in_progress", "blocked", "parked", "deferred", "skipped_already_done", "failed"],
  in_progress: ["implemented", "validated", "integrated", "blocked", "parked", "deferred", "failed"],
  implemented: ["validated", "integrated", "blocked", "parked", "deferred", "failed"],
  validated: ["integrated", "blocked", "parked", "deferred", "failed"],
  integrated: ["released", "blocked", "parked", "failed"],
  released: ["verified", "validation_failed", "failed"],
  verified: ["closed", "failed"],
  validation_failed: ["closed", "parked", "failed"],
  blocked: ["in_progress", "parked", "deferred", "failed"],
  deferred: [],
  parked: [],
  skipped_already_done: [],
  closed: [],
  failed: [],
};

// Returns an error message when from -> to is not allowed, otherwise null.
export function transitionError(from, to) {
  if (from === to) return null;
  const allowed = ISSUE_TRANSITIONS[from];
  if (!allowed) return `issue status '${from}' is not a known status`;
  if (allowed.includes(to)) return null;
  return `issue status ${from} -> ${to} is not allowed (allowed: ${allowed.length ? allowed.join(", ") : "none, terminal"})`;
}

// A bundle past its merge no longer needs the orchestrator's one-active-bundle lock: the validator finishes it, and the release
// slot still keeps the next bundle from releasing (AC 7.19.41). `validating` counts only once the merge sha is recorded,
// because the integration step also uses it before the release PR.
export function pastMerge(st) {
  if (st?.phase === "merged" || st?.phase === "deployed") return true;
  return st?.phase === "validating" && Boolean(st?.release?.mergeSha);
}

// Bundle phases that hold the release slot: one bundle at a time between its release PR opening and its validation ending (design A, F3).
export const RELEASE_SLOT_PHASES = new Set(["release_pr_open", "ci_green", "merged", "deployed", "validating"]);

// Phases where the recorded release PR is read: a PR closed without merging there no longer holds the slot (#930).
export const PR_CHECKED_PHASES = new Set(["release_pr_open", "ci_green"]);

// The other bundle that holds the release slot, or null. Reads each bundle's state.json under bundlesDir.
// With prState(prNumber, repo) -> "OPEN" | "CLOSED" | "MERGED" | null, a bundle in release_pr_open or ci_green whose
// recorded PR is CLOSED does not hold the slot. MERGED holds it (the merge is not recorded yet) and says so; a PR
// state that cannot be read (null) holds it too.
export function releaseSlotHolder(bundlesDir, bundleId, { prState } = {}) {
  if (!bundlesDir || !fs.existsSync(bundlesDir)) return null;
  for (const dir of fs.readdirSync(bundlesDir)) {
    if (dir === bundleId) continue;
    const file = path.join(bundlesDir, dir, "state.json");
    if (!fs.existsSync(file)) continue;
    let st;
    try { st = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    if (!RELEASE_SLOT_PHASES.has(st.phase)) continue;
    const pr = st.release?.prNumber;
    if (typeof prState !== "function" || !PR_CHECKED_PHASES.has(st.phase) || !pr) return { bundleId: dir, phase: st.phase };
    let repo = null;
    try { repo = JSON.parse(fs.readFileSync(path.join(bundlesDir, dir, "manifest.json"), "utf8")).repo?.nameWithOwner ?? null; } catch { repo = null; }
    let state = null;
    try { state = prState(pr, repo); } catch { state = null; }
    if (state === "CLOSED") continue;
    return { bundleId: dir, phase: st.phase, pr, prState: state ?? "unknown" };
  }
  return null;
}

// The refusal for a held slot. A merged PR names the commands that record the merge and finish the validation.
export function releaseSlotMessage(holder) {
  const base = `Release slot is held by bundle '${holder.bundleId}' (phase ${holder.phase})`;
  if (holder.prState === "MERGED") {
    return `${base}: its release PR #${holder.pr} is merged but the merge is not recorded. Record it with \`bundle.mjs phase ${holder.bundleId} merged --merge-sha <sha> --holder <token>\` (sha from \`gh pr view ${holder.pr} --json mergeCommit\`), then finish its validation: \`phase ${holder.bundleId} deployed --deploy-run <id>\`, \`phase ${holder.bundleId} validating\`, \`validation ${holder.bundleId} --issue <n> --result pass|fail --evidence <url>\` for each issue, then \`phase ${holder.bundleId} verified\` and \`done\`.`;
  }
  if (holder.prState === "unknown") return `${base}: the state of its release PR #${holder.pr} could not be read, so the slot stays held. Retry when gh can read it.`;
  return `${base}. Wait until it is verified, done or blocked_terminal.`;
}

export const VALIDATION_KINDS = ["environmental", "defect", "ac-wrong", "product", "rolled-back"];

// Every outcome validationOutcome can return, plus "closable" for a pass. failure-labels.mjs maps each one to labels.
export const VALIDATION_OUTCOMES = ["closable", "recheck-once", "needs-attention", "fix-forward", "needs-refinement", "park"];

// What the validator does next with a failed issue (design E, AC 7.19.42). A pass has no outcome here: it closes.
// recheck is true when this result is the one recorded after the single environmental re-check.
export function validationOutcome(kind, fixCycle, recheck = false) {
  if (kind === "environmental") return recheck ? "needs-attention" : "recheck-once";
  if (kind === "ac-wrong") return "needs-refinement";
  if (kind === "product") return "park";
  if (kind === "rolled-back") return "fix-forward"; // a rollback reverts the whole release: it keeps the fix budget
  if (kind === "defect") return fixCycle === 0 ? "fix-forward" : "park";
  return "park";
}
