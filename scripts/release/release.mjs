#!/usr/bin/env node
// Release driver (AC 7.11.10 to 7.11.17). Three calls turn a green release PR into posted evidence:
//
//   node scripts/release/release.mjs wait-pr --pr <n>
//   node scripts/release/release.mjs ship --pr <n> --issues <n,n>     (run again until it reports deployed)
//   node scripts/release/release.mjs evidence --issues <n,n> --report <results.json> [--report ...] [--run-url <url>]
//                                             [--env <text>] [--out <dir>] [--post] [--close]
//   node scripts/release/release.mjs status
//
// Every call prints one JSON line {step, ok, class, detail, next} and exits 0 (ok, or still pending), 2 (needs action)
// or 3 (the same failure as the previous attempt). Halt and state files live under <root>/.qm. All GitHub calls go
// through gh() below, so tests can replace it. Printed output has secret-looking environment values redacted.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SECRET_NAME = /PASSWORD|SECRET|TOKEN|KEY/i;
const SECRET_NAMED = ["QM_AGENT_SUPADB_CS"];
const DEPLOY_JOBS = ["deploy-container", "deploy-ui"];
const PASSING = ["SUCCESS", "SKIPPED", "NEUTRAL"];

/** Values of environment variables whose names look secret. Short values are too ambiguous to redact. */
export function secretValues(env = process.env) {
  return Object.entries(env)
    .filter(([name, value]) => value && value.length >= 4 && (SECRET_NAME.test(name) || SECRET_NAMED.includes(name)))
    .map(([, value]) => value);
}

export function redact(text, env = process.env) {
  let out = String(text);
  for (const value of secretValues(env)) out = out.split(value).join("***");
  return out;
}

/** The only place that runs gh. Under node --test an unmocked call throws, so a test cannot reach GitHub by accident. */
export function gh(args, deps = {}) {
  if (!deps.gh && process.env.NODE_TEST_CONTEXT) throw new Error(`gh ${args[0]} called without a test double`);
  if (deps.gh) return deps.gh(args);
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function ghJson(args, deps = {}) {
  const text = gh(args, deps);
  return text && text.trim() ? JSON.parse(text) : null;
}

export function paths(root = process.cwd(), env = process.env) {
  const local = env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return {
    halt: path.join(root, ".qm", "release-halt.json"),
    state: path.join(root, ".qm", "release-state.json"),
    ledger: path.join(root, ".qm", "ledger", "releases.jsonl"),
    lock: path.join(local, "Quizymode", "automation", "locks", "release.lock"),
  };
}

export function result(step, ok, cls, detail, next, exit) {
  return { step, ok, class: cls, detail, next, exit };
}

/** A halted or locked release is refused before anything else happens (AC 7.11.16). */
export function refusal(p) {
  if (fs.existsSync(p.halt)) return `releases are halted: ${p.halt} exists; fix the cause and remove the file`;
  if (fs.existsSync(p.lock)) return `the automation release lock is held: ${p.lock}`;
  return null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Normalizes check runs and commit statuses from statusCheckRollup into { name, failed, pending }. */
export function normalizeChecks(rollup) {
  return (rollup ?? []).map((c) => {
    const outcome = String(c.conclusion || c.state || "").toUpperCase();
    const pending = c.status !== undefined ? c.status !== "COMPLETED" : outcome === "PENDING" || outcome === "";
    const failed = !pending && !PASSING.includes(outcome);
    return { name: c.name ?? c.context ?? "unnamed check", failed, pending };
  });
}

export function sameList(a, b) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

/** Open code-scanning alerts that the PR adds to main, and top-level review comments nobody replied to. */
export function findings(pr, deps = {}) {
  const prAlerts = ghJson(["api", `repos/{owner}/{repo}/code-scanning/alerts?ref=refs/pull/${pr}/merge&state=open`], deps) ?? [];
  const mainAlerts = ghJson(["api", "repos/{owner}/{repo}/code-scanning/alerts?ref=refs/heads/main&state=open"], deps) ?? [];
  const onMain = new Set(mainAlerts.map((a) => a.number));
  const out = [];
  for (const alert of prAlerts.filter((a) => !onMain.has(a.number))) {
    const loc = alert.most_recent_instance?.location ?? {};
    out.push(`code scanning alert #${alert.number} (${alert.rule?.id ?? "rule"}) at ${loc.path ?? "?"}:${loc.start_line ?? "?"}`);
  }
  const comments = ghJson(["api", `repos/{owner}/{repo}/pulls/${pr}/comments`], deps) ?? [];
  const replied = new Set(comments.map((c) => c.in_reply_to_id).filter(Boolean));
  for (const c of comments.filter((c) => !c.in_reply_to_id && !replied.has(c.id))) {
    out.push(`unanswered review comment #${c.id} by ${c.user?.login ?? "unknown"} at ${c.path ?? "?"}`);
  }
  return out;
}

export function waitPr({ pr, root, deps = {} }) {
  const p = paths(root, deps.env);
  const blocked = refusal(p);
  if (blocked) return result("wait-pr", false, "gate", blocked, "resolve the halt or wait for the lock to clear", 2);

  const view = ghJson(["pr", "view", String(pr), "--json", "statusCheckRollup,headRefOid"], deps) ?? {};
  const checks = normalizeChecks(view.statusCheckRollup);
  const failing = checks.filter((c) => c.failed).map((c) => c.name);
  const pending = checks.filter((c) => c.pending).map((c) => c.name);
  if (!checks.length) pending.push("no checks reported yet");

  const found = findings(pr, deps);
  if (found.length) {
    return result("wait-pr", false, "finding", found.join("; "), "reply to or fix each finding on the release branch", 2);
  }
  if (failing.length) {
    const state = readJson(p.state) ?? {};
    const previous = state.lastFailure;
    const same = Boolean(previous && previous.pr === pr && sameList(previous.failing, failing));
    writeJson(p.state, { ...state, lastFailure: { pr, failing, headSha: view.headRefOid ?? null, at: new Date().toISOString() } });
    if (same) {
      return result("wait-pr", false, "same-failure", `same failing checks as the last attempt: ${failing.join(", ")}`,
        "stop: read the job logs before another fix", 3);
    }
    return result("wait-pr", false, "test", `failing checks: ${failing.join(", ")}`,
      "read gh run view <run> --log-failed, fix on the release branch, push, and run wait-pr again", 2);
  }
  if (pending.length) {
    return result("wait-pr", false, "pending", `waiting for: ${pending.join(", ")}`, "run wait-pr again later", 0);
  }
  const cleared = readJson(p.state);
  if (cleared?.lastFailure) {
    const { lastFailure, ...rest } = cleared;
    writeJson(p.state, rest);
  }
  return result("wait-pr", true, "ok", "all checks passed and there are no new findings", `run ship --pr ${pr}`, 0);
}

/** Runs ac-gate for the bundle's issues from the checkout root. Injected in tests. */
function defaultAcGate(issues, root) {
  try {
    execFileSync("node", ["scripts/validation/ac-gate.mjs", "--issues", issues.join(",")],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, detail: "" };
  } catch (error) {
    return { ok: false, detail: String(error.stdout || error.stderr || error.message).trim().slice(0, 400) };
  }
}

function recordLedger(p, entry) {
  fs.mkdirSync(path.dirname(p.ledger), { recursive: true });
  fs.appendFileSync(p.ledger, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

/**
 * Finds the Deploy run that the CI run on this SHA triggered (AC 7.11.13). An exact match on the triggering run id
 * is used when the API reports one. The live API does not, so otherwise the latest workflow_run-triggered Deploy on
 * this SHA created after the CI run started is taken: a re-run of Deploy supersedes an earlier attempt, and the deploy
 * concurrency group runs them one at a time.
 */
export function deployFor(sha, ciRun, deps = {}) {
  const runs = ghJson(["api", `repos/{owner}/{repo}/actions/workflows/deploy.yml/runs?head_sha=${sha}`], deps)?.workflow_runs ?? [];
  const triggered = runs.filter((r) => r.event === "workflow_run" && r.head_sha === sha);
  const exact = triggered.find((r) => r.workflow_run?.id === ciRun.databaseId);
  if (exact) return exact;
  const started = Date.parse(ciRun.createdAt ?? "") || 0;
  return triggered
    .filter((r) => Date.parse(r.created_at ?? "") >= started)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

function deployStage({ pr, sha, p, deps }) {
  const ciRuns = ghJson(["run", "list", "--workflow", "CI", "--branch", "main",
    "--json", "databaseId,headSha,status,conclusion,createdAt", "--limit", "30"], deps) ?? [];
  const ci = ciRuns.find((r) => r.headSha === sha);
  if (!ci) return result("ship", false, "pending", `no CI run on main for ${sha.slice(0, 8)} yet`, "run ship again later", 0);
  if (ci.status !== "completed") return result("ship", false, "pending", `CI on main is ${ci.status}`, "run ship again later", 0);
  if (ci.conclusion !== "success") {
    return result("ship", false, "ci", `CI on main concluded ${ci.conclusion}; no deploy runs`,
      "production is unchanged; read the failing job and stop", 2);
  }
  const deploy = deployFor(sha, ci, deps);
  if (!deploy) return result("ship", false, "pending", "no Deploy run for this CI run yet", "run ship again later", 0);
  if (deploy.status !== "completed") return result("ship", false, "pending", `Deploy run ${deploy.id} is ${deploy.status}`, "run ship again later", 0);

  const jobs = ghJson(["api", `repos/{owner}/{repo}/actions/runs/${deploy.id}/jobs`], deps)?.jobs ?? [];
  const failed = jobs.filter((j) => DEPLOY_JOBS.includes(j.name) && j.conclusion === "failure").map((j) => j.name);
  if (failed.length) {
    writeJson(p.halt, { pr, mergeSha: sha, deployRun: deploy.id, failedJobs: failed, at: new Date().toISOString() });
    recordLedger(p, { pr, mergeSha: sha, ciRun: ci.databaseId, deployRun: deploy.id, outcome: "deploy-failed" });
    return result("ship", false, "deploy", `Deploy run ${deploy.id} failed: ${failed.join(", ")}; releases are halted`,
      "production may need a rollback (Rollback workflow); fix the cause and remove .qm/release-halt.json", 2);
  }
  if (deploy.conclusion !== "success") {
    return result("ship", false, "verify", `Deploy run ${deploy.id} concluded ${deploy.conclusion}`,
      "read the failing job; no halt file is written for this job", 2);
  }
  const skipped = jobs.some((j) => DEPLOY_JOBS.includes(j.name) && j.conclusion === "skipped");
  recordLedger(p, { pr, mergeSha: sha, ciRun: ci.databaseId, deployRun: deploy.id, outcome: skipped ? "nothing-deployed" : "deployed" });
  return result("ship", true, skipped ? "nothing-to-deploy" : "deployed",
    `Deploy run ${deploy.id} succeeded${skipped ? " (no deploy job was needed)" : ""} for ${sha.slice(0, 8)}`,
    "run evidence --issues <n,n> with the CI and prod reports", 0);
}

export function ship({ pr, issues = [], root, deps = {} }) {
  const p = paths(root, deps.env);
  const blocked = refusal(p);
  if (blocked) return result("ship", false, "gate", blocked, "resolve the halt or wait for the lock to clear", 2);

  const view = ghJson(["pr", "view", String(pr), "--json", "state,statusCheckRollup,mergeCommit,headRefOid"], deps) ?? {};
  if (view.state !== "MERGED") {
    const checks = normalizeChecks(view.statusCheckRollup);
    const failing = checks.filter((c) => c.failed).map((c) => c.name);
    const pending = checks.filter((c) => c.pending).map((c) => c.name);
    if (!checks.length) pending.push("no checks reported yet");
    if (failing.length) return result("ship", false, "gate", `refusing to merge: failing checks ${failing.join(", ")}`, "fix the PR first", 2);
    if (pending.length) return result("ship", false, "gate", `refusing to merge: pending checks ${pending.join(", ")}`, "wait for the checks", 2);
    if (!issues.length) return result("ship", false, "gate", "refusing to merge: pass --issues so ac-gate can check them", "rerun with --issues", 2);
    const gate = deps.acGate ? deps.acGate(issues) : defaultAcGate(issues, root);
    if (!gate.ok) return result("ship", false, "gate", `refusing to merge: ac-gate rejected the issues: ${gate.detail}`, "fix the ACs", 2);
    if (!view.headRefOid) return result("ship", false, "gate", "refusing to merge: the PR head commit is unknown", "check the PR by hand", 2);
    // Pinned to the head that was checked, so a push that lands during ac-gate cannot merge unverified.
    gh(["pr", "merge", String(pr), "--merge", "--match-head-commit", view.headRefOid], deps);
    const after = ghJson(["pr", "view", String(pr), "--json", "state,mergeCommit"], deps) ?? {};
    const sha = after.mergeCommit?.oid;
    if (!sha) return result("ship", false, "verify", "merged, but no merge commit was reported", "check the PR by hand", 2);
    writeJson(p.state, { ...(readJson(p.state) ?? {}), merged: { pr, sha, at: new Date().toISOString() } });
    return result("ship", true, "merged", `PR #${pr} merged at ${sha.slice(0, 8)}`, `run ship --pr ${pr} again to follow CI and Deploy`, 0);
  }
  const sha = view.mergeCommit?.oid ?? readJson(p.state)?.merged?.sha;
  if (!sha) return result("ship", false, "verify", "PR is merged but its merge commit is unknown", "check the PR by hand", 2);
  return deployStage({ pr, sha, p, deps });
}

// The CI job that runs every scripts/tests file; a unit AC is evidenced only by a run where it passed (AC 7.11.19).
export const REQUIRED_CI_JOB = "automation-contract";

function headSha(root, deps) {
  if (deps.headSha !== undefined) return deps.headSha;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** A CI run counts as unit evidence only when GitHub reports it completed green on the release commit (AC 7.11.19). */
export function verifyCiRun(runUrl, sha, deps = {}) {
  const match = /\/actions\/runs\/(\d+)/.exec(runUrl);
  if (!match) return { ok: false, reason: `not a GitHub Actions run URL: ${runUrl}` };
  const id = match[1];
  let run;
  try {
    run = ghJson(["run", "view", id, "--json", "status,conclusion,headSha,jobs"], deps);
  } catch (error) {
    return { ok: false, reason: `could not read run ${id}: ${String(error.message).slice(0, 120)}` };
  }
  if (!run) return { ok: false, reason: `run ${id} not found` };
  if (run.status !== "completed" || run.conclusion !== "success") return { ok: false, reason: `run ${id} is ${run.status}/${run.conclusion}, not success` };
  if (!sha || run.headSha !== sha) return { ok: false, reason: `run ${id} built ${run.headSha}, not the release commit ${sha || "(unknown)"}` };
  const jobs = run.jobs ?? [];
  if (!jobs.some((job) => job.name === REQUIRED_CI_JOB && job.conclusion === "success")) {
    return { ok: false, reason: `run ${id} has no successful ${REQUIRED_CI_JOB} job` };
  }
  const failed = jobs.filter((job) => job.conclusion !== "success" && job.conclusion !== "skipped").map((job) => job.name);
  if (failed.length) return { ok: false, reason: `run ${id} has unsuccessful jobs: ${failed.join(", ")}` };
  return { ok: true, reason: "" };
}

/** Closes each issue only when ac-evidence reports all its rows complete (AC 7.11.17). Reports are optional (AC 7.11.19). */
export function evidence({ issues, reports = [], runUrl, sha, env, out, post, close, root, deps = {} }) {
  let verifiedRun = "";
  let runNote = "";
  if (runUrl) {
    const check = verifyCiRun(runUrl, sha ?? headSha(root, deps), deps);
    if (check.ok) verifiedRun = runUrl;
    else runNote = check.reason;
  }
  const args = ["scripts/validation/ac-evidence.mjs", "--issues", issues.join(",")];
  for (const r of reports) args.push("--report", r);
  if (verifiedRun) args.push("--run-url", verifiedRun);
  if (env) args.push("--env", env);
  if (out) args.push("--out", out);
  if (post) args.push("--post");
  const stdout = deps.runEvidence ? deps.runEvidence(args, root)
    : execFileSync("node", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const summary = JSON.parse(stdout);
  const closed = [];
  const open = [];
  for (const row of summary) {
    if (row.complete) {
      if (close) {
        gh(["issue", "close", String(row.issue), "--reason", "completed"], deps);
        closed.push(row.issue);
      }
    } else {
      open.push(`#${row.issue}: ${(row.open ?? []).join("; ") || "rows incomplete"}`);
    }
  }
  if (open.length) {
    const why = !reports.length && !verifiedRun ? "no Playwright report and no accepted CI run; " : "";
    const notAccepted = runNote ? ` | CI run not accepted: ${runNote}` : "";
    return result("evidence", false, "open", `incomplete: ${why}left open: ${open.join(" | ")}${notAccepted}`, "pass --run-url of a green CI run on the release commit, or --report for Playwright ACs, then run evidence again", 2);
  }
  const detail = close ? `closed ${closed.map((n) => `#${n}`).join(", ")}` : "all rows complete; nothing closed (no --close)";
  return result("evidence", true, "complete", detail, "post the evidence comments if --post was not used", 0);
}

export function status({ root, deps = {} }) {
  const p = paths(root, deps.env);
  return result("status", true, "status", JSON.stringify({
    halted: fs.existsSync(p.halt), locked: fs.existsSync(p.lock), halt: readJson(p.halt), state: readJson(p.state),
  }), "", 0);
}

export function parseFlags(argv) {
  const flags = { report: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key === "close" || key === "post") {
      flags[key] = true;
    } else if (key === "report") {
      flags.report.push(next);
      i++;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

export function emit(r, env = process.env) {
  const { exit, ...line } = r;
  const clean = Object.fromEntries(Object.entries(line).map(([k, v]) => [k, typeof v === "string" ? redact(v, env) : v]));
  console.log(redact(JSON.stringify(clean), env));
  return exit;
}

/** Runs one command and returns its exit code. */
export function main(argv = process.argv.slice(2), deps = {}) {
  const [command, ...rest] = argv;
  try {
    return run(command, parseFlags(rest), deps);
  } catch (error) {
    return emit(result(command ?? "usage", false, "error", String(error.message).slice(0, 300), "check the output above and retry", 2));
  }
}

function run(command, f, deps) {
  const root = f.root ?? process.cwd();
  const issues = f.issues ? f.issues.split(",").map((n) => Number(n.trim())).filter(Boolean) : [];
  const pr = f.pr !== undefined ? Number(f.pr) : undefined;
  let r;
  switch (command) {
    case "wait-pr":
      if (!pr) r = result("wait-pr", false, "usage", "missing --pr", "", 2);
      else r = waitPr({ pr, root, deps });
      break;
    case "ship":
      if (!pr) r = result("ship", false, "usage", "missing --pr", "", 2);
      else r = ship({ pr, issues, root, deps });
      break;
    case "evidence":
      if (!issues.length) r = result("evidence", false, "usage", "missing --issues", "", 2);
      else r = evidence({ issues, reports: f.report, runUrl: f["run-url"], sha: f.sha, env: f.env, out: f.out, post: f.post, close: f.close, root, deps });
      break;
    case "status":
      r = status({ root, deps });
      break;
    default:
      r = result("usage", false, "usage", "commands: wait-pr, ship, evidence, status", "", 2);
  }
  return emit(r);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
