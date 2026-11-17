// Claude provider adapter — DRAFT.
//
// Scope: this file only implements the Claude-side half of the shared
// automation workflow (invoking the subscription-authenticated `claude`
// CLI per specialist role). It does NOT implement a scheduler, durable
// state, issue claims, an artifact publisher, or a release lock — those
// are owned by the shared controller, which is not committed anywhere in
// this repo yet (see controller-contract.stub.mjs for details). Do not
// extend this file to duplicate those responsibilities; propose shared
// changes instead.
//
// Policy constraints enforced here (do not relax without re-reading the
// task that produced this file):
//   - Subscription auth only (claude.ai), never an API-key paid fallback.
//   - Never pass --dangerously-skip-permissions / bypassPermissions.
//     Least-privilege is done via --allowedTools, not a blanket bypass.

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { SPECIALIST_ROLES, validateEvidence } from "./controller-contract.stub.mjs";
import { baselineModel, chooseAvailable } from "./model-policy.mjs";

const execFileAsync = promisify(execFileCb);

export class AdapterError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.details = details;
  }
}

// Role -> baseline model: what a direct invocation with no packet gets. It comes from the shared policy
// (model-policy.mjs, AC 7.13.3), so no role defaults to opus. A packet supplies the model for each dispatch.
export const MODEL_ASSIGNMENTS = Object.freeze(
  Object.fromEntries(SPECIALIST_ROLES.map((role) => [role, Object.freeze({ baseline: baselineModel(role) })])),
);

/**
 * Chooses the model for a dispatch. The requested model (from the packet) or the role baseline is used when available.
 * When it is not, only a cheaper model may replace it, and the substitution is recorded. More expensive substitution
 * never happens: with no cheaper model available this throws MODEL_UNAVAILABLE.
 */
export function resolveModel(role, { availableModels, requested } = {}) {
  if (!SPECIALIST_ROLES.includes(role)) {
    throw new AdapterError("UNKNOWN_ROLE", `No model assignment for role "${role}"`);
  }
  const wanted = requested ?? MODEL_ASSIGNMENTS[role].baseline;
  const chosen = chooseAvailable(wanted, availableModels);
  if (chosen.unavailable) {
    throw new AdapterError("MODEL_UNAVAILABLE", `"${wanted}" is not available for role "${role}", and no cheaper model is`, { role, wanted, availableModels });
  }
  return { model: chosen.model, substituted: chosen.substituted, reason: chosen.reason };
}

/**
 * Verifies the CLI is present, subscription-authenticated (not a paid API
 * key fallback), and reports its version. Throws AdapterError on any
 * violation of the auth policy rather than silently continuing.
 */
export async function checkCliCapabilities({ exec = execFileAsync } = {}) {
  const [versionResult, authResult] = await Promise.all([
    exec("claude", ["--version"]),
    exec("claude", ["auth", "status"]),
  ]);

  let auth;
  try {
    auth = JSON.parse(authResult.stdout);
  } catch (cause) {
    throw new AdapterError(
      "MALFORMED_OUTPUT",
      '"claude auth status" did not return parseable JSON',
      { stdout: authResult.stdout, cause },
    );
  }

  if (!auth.loggedIn) {
    throw new AdapterError("NOT_AUTHENTICATED", "Claude CLI is not logged in");
  }

  const usesApiKeyFallback = Boolean(auth.apiProvider) && auth.apiProvider !== "firstParty";
  if (usesApiKeyFallback) {
    throw new AdapterError(
      "PAID_API_FALLBACK_FORBIDDEN",
      `Expected subscription auth (claude.ai), got apiProvider="${auth.apiProvider}"`,
      { auth },
    );
  }

  return {
    version: versionResult.stdout.trim(),
    authMethod: auth.authMethod,
    subscriptionType: auth.subscriptionType,
    email: auth.email,
  };
}

const QUOTA_ERROR_PATTERNS = [/rate.?limit/i, /overloaded/i, /quota/i, /\b429\b/];

function looksLikeQuotaError(text) {
  return QUOTA_ERROR_PATTERNS.some((pattern) => pattern.test(text ?? ""));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one specialist step through the Claude CLI in headless/print mode.
 * Dependency-injectable `exec` so this can be unit tested without shelling
 * out to the real CLI (see claude-adapter.test.mjs).
 */
export async function runSpecialist({
  role,
  prompt,
  repoPath,
  allowedTools = [],
  model,
  availableModels,
  permissionMode = "acceptEdits",
  sessionId,
  resume = false,
  maxBudgetUsd,
  attempt = 1,
  maxAttempts = 2,
  exec = execFileAsync,
  backoffMs = (n) => 2 ** n * 1000,
  sleep = delay,
}) {
  if (!SPECIALIST_ROLES.includes(role)) {
    throw new AdapterError("UNKNOWN_ROLE", `Unknown specialist role "${role}"`);
  }
  if (permissionMode === "bypassPermissions") {
    throw new AdapterError(
      "PERMISSION_POLICY_VIOLATION",
      "bypassPermissions is forbidden by policy; scope access with allowedTools instead",
    );
  }

  const resolved = resolveModel(role, { availableModels, requested: model });

  const args = [
    "-p",
    prompt,
    "--agent",
    role,
    "--model",
    resolved.model,
    "--output-format",
    "json",
    "--permission-mode",
    permissionMode,
  ];
  if (allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(","));
  }
  if (maxBudgetUsd) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }
  if (resume && sessionId) {
    args.push("--resume", sessionId);
  } else if (sessionId) {
    args.push("--session-id", sessionId);
  }

  let stdout;
  try {
    const result = await exec("claude", args, repoPath ? { cwd: repoPath } : {});
    stdout = result.stdout;
  } catch (err) {
    const combinedText = `${err.stderr ?? ""} ${err.message ?? ""}`;
    if (looksLikeQuotaError(combinedText)) {
      if (attempt >= maxAttempts) {
        throw new AdapterError(
          "QUOTA_RETRIES_EXHAUSTED",
          `Quota/overload error persisted after ${attempt} attempt(s) for role "${role}"`,
          { role, sessionId, lastError: combinedText.trim() },
        );
      }
      await sleep(backoffMs(attempt));
      return runSpecialist({
        role,
        prompt,
        repoPath,
        allowedTools,
        model,
        availableModels,
        permissionMode,
        sessionId,
        resume,
        maxBudgetUsd,
        attempt: attempt + 1,
        maxAttempts,
        exec,
        backoffMs,
        sleep,
      });
    }
    throw new AdapterError("CLI_INVOCATION_FAILED", err.message, { role, stderr: err.stderr });
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (cause) {
    throw new AdapterError(
      "MALFORMED_OUTPUT",
      `claude CLI did not return valid JSON for role "${role}"`,
      { stdout, cause },
    );
  }

  return {
    role,
    model: resolved.model,
    modelSubstituted: resolved.substituted,
    modelSubstitutionReason: resolved.reason,
    // Dispatch record (AC 7.13.3): what ran, what was asked for, and why.
    dispatch: { role, model: resolved.model, requested: model ?? MODEL_ASSIGNMENTS[role].baseline, substituted: resolved.substituted, reason: resolved.reason ?? null },
    sessionId: parsed.session_id ?? sessionId,
    attempts: attempt,
    result: parsed,
  };
}

/**
 * Re-entry point after the shared controller flags a merge conflict:
 * fetch, rebase onto the current base, then re-run the coder role with the
 * conflict context folded into the prompt. Caller is responsible for
 * re-running reviewer/tester after this returns (per task policy: any
 * post-conflict code change requires affected tests and review to run
 * again).
 */
export async function resolveConflict({
  repoPath,
  baseRef = "main",
  prompt,
  allowedTools = ["Read", "Edit", "Bash(git *)"],
  exec = execFileAsync,
  runSpecialistFn = runSpecialist,
}) {
  await exec("git", ["fetch", "origin", baseRef], { cwd: repoPath });
  await exec("git", ["rebase", `origin/${baseRef}`], { cwd: repoPath });
  return runSpecialistFn({
    role: "coder",
    prompt,
    repoPath,
    allowedTools,
    exec,
  });
}

/**
 * Guards the reporter role: refuses to hand back a "ready to publish"
 * result for incomplete evidence. Mirrors the task rule that test listing
 * is not execution and that PASS must never be inferred from a coder's
 * claim or a green build alone (caller/prompt still has to supply real
 * evidence — this only checks shape/completeness, not truthfulness).
 */
export function assertPublishableEvidence(evidence) {
  const verdict = validateEvidence(evidence);
  if (!verdict.ok) {
    throw new AdapterError("INCOMPLETE_EVIDENCE", "Evidence failed schema validation", verdict);
  }
  return evidence;
}
