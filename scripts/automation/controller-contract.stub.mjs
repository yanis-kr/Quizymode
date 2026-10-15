// DRAFT — stand-in for the shared release-controller contract.
//
// Status as of 2026-10-15: no shared contract is committed anywhere in this
// repo. There is no docs/automation/workflow.md, no scheduler, no durable
// state store, no issue-claim mechanism, no artifact publisher, and no
// global release lock on `main` or on this branch. A separate worktree
// (branch `codex/automation-bootstrap`, likely owned by Codex/another
// agent session) exists locally but has nothing beyond main committed to
// it yet, so its real interface is unknown.
//
// This file exists only so the Claude provider adapter
// (./claude-adapter.mjs) has something concrete to code and test against.
// It is intentionally minimal and is NOT the real contract. Do not build
// production automation on top of this stub, and do not treat its shapes
// as stable — replace every import of this file with the real shared
// module the moment it is committed, and re-run the adapter tests against
// it (they are written to fail loudly on shape mismatches, not silently
// pass).

export const SPECIALIST_ROLES = Object.freeze([
  "architect",
  "ux-designer",
  "reviewer",
  "coder",
  "tester",
  "reporter",
]);

/**
 * Assumed shape of a unit of work handed to a provider adapter by the
 * (not-yet-existing) scheduler. Field names are guesses based on the task
 * description, not a confirmed schema.
 *
 * @typedef {{
 *   issueNumber: number,
 *   role: typeof SPECIALIST_ROLES[number],
 *   repoPath: string,
 *   baseRef: string,
 *   sessionId?: string,
 *   attempt: number,
 *   maxAttempts: number,
 * }} HandoffTask
 */

/**
 * Assumed shape of the structured evidence a reporter must publish.
 * Mirrors "REQUIRED ISSUE EVIDENCE" from the task description, not a
 * confirmed schema.
 *
 * @typedef {{
 *   issueNumber: number,
 *   testedSha: string,
 *   environment: string,
 *   dateIso: string,
 *   prUrl: string,
 *   criteria: Array<{
 *     name: string,
 *     status: "PASS" | "FAIL" | "NOT_RUN" | "BLOCKED" | "N/A",
 *     justification?: string,
 *     test?: string,
 *     evidenceLink?: string,
 *   }>,
 *   blockers: string[],
 * }} EvidenceReport
 */

export const EVIDENCE_REQUIRED_FIELDS = Object.freeze([
  "issueNumber",
  "testedSha",
  "environment",
  "dateIso",
  "prUrl",
  "criteria",
]);

export const CRITERION_STATUSES = Object.freeze([
  "PASS",
  "FAIL",
  "NOT_RUN",
  "BLOCKED",
  "N/A",
]);

/**
 * Validates an evidence report against the stub schema. Rejects anything
 * incomplete rather than letting a reporter publish a partial claim.
 * @param {Partial<EvidenceReport>} evidence
 * @returns {{ ok: true } | { ok: false, missing: string[], invalidCriteria: string[] }}
 */
export function validateEvidence(evidence) {
  const missing = EVIDENCE_REQUIRED_FIELDS.filter((field) => {
    const value = evidence?.[field];
    return value === undefined || value === null || value === "";
  });

  const invalidCriteria = [];
  if (Array.isArray(evidence?.criteria)) {
    if (evidence.criteria.length === 0) {
      invalidCriteria.push("criteria: must list at least one AC");
    }
    for (const criterion of evidence.criteria) {
      if (!criterion?.name) {
        invalidCriteria.push("criteria[]: missing name");
      }
      if (!CRITERION_STATUSES.includes(criterion?.status)) {
        invalidCriteria.push(
          `criteria[${criterion?.name ?? "?"}]: invalid status "${criterion?.status}"`,
        );
      }
      if (criterion?.status === "PASS" && !criterion?.test && !criterion?.evidenceLink) {
        invalidCriteria.push(
          `criteria[${criterion?.name}]: PASS claimed with no test or evidence link`,
        );
      }
    }
  } else {
    invalidCriteria.push("criteria: must be an array");
  }

  if (missing.length === 0 && invalidCriteria.length === 0) {
    return { ok: true };
  }
  return { ok: false, missing, invalidCriteria };
}
