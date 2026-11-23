// Run file for an autopilot run (#760): .qm/autopilot/run.json under the main checkout's .qm folder.
// bundle.mjs writes it; the PreToolUse and Stop hooks in autopilot-hook.mjs read it. No run file means both hooks do nothing.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TERMINAL_PHASES = new Set(["done", "done_partial", "blocked_terminal", "cancelled"]);
export const STALL_AFTER_BLOCKS = 3;

export function runFilePath(qmDir) {
  return path.join(qmDir, "autopilot", "run.json");
}

export function readRun(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeRun(file, run) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(run, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

// The hooks act only for the session that owns a live run.
export function isLiveRunFor(run, sessionId) {
  return Boolean(run && typeof run.session === "string" && run.session === sessionId && !TERMINAL_PHASES.has(run.phase) && !run.stalled);
}

// Main checkout's .qm folder, found the same way bundle.mjs finds it, so worktrees see the same run file.
export function mainQmDir(cwd = process.cwd()) {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout.trim()) return path.join(cwd, ".qm");
  return path.join(path.dirname(r.stdout.trim()), ".qm");
}

// Waiting on CI (#761, AC 7.19.20). While a run waits for an external event (a PR check or a main/Deploy run),
// it records run.waiting so the Stop hook lets the turn end without counting toward the stall limit.
// The wait expires after WAIT_MAX_MINUTES, so a monitor that never fires cannot hold the run open forever.
export const WAIT_MAX_MINUTES = 60;

export function isWaiting(run, now = Date.now()) {
  if (!run || !run.waiting || typeof run.waiting.since !== "string") return false;
  const since = Date.parse(run.waiting.since);
  return Number.isFinite(since) && now - since < WAIT_MAX_MINUTES * 60 * 1000;
}

// CLI: node autopilot-run.mjs wait --pr <n> | --run <id>   and   node autopilot-run.mjs wait-clear
// Honors QM_DIR like the hooks do. Does nothing (exit 0, "no-run") when no run file exists.
function cliMain(argv, env, cwd) {
  const [cmd, ...rest] = argv;
  const qmDir = env.QM_DIR ? path.resolve(env.QM_DIR) : mainQmDir(cwd);
  const file = runFilePath(qmDir);
  const run = readRun(file);
  if (!run) return { exit: 0, out: { ok: true, result: "no-run" } };
  if (cmd === "wait-clear") {
    delete run.waiting;
    writeRun(file, run);
    return { exit: 0, out: { ok: true, result: "cleared" } };
  }
  if (cmd === "wait") {
    const pr = rest[rest.indexOf("--pr") + 1];
    const runId = rest[rest.indexOf("--run") + 1];
    if (!(rest.includes("--pr") || rest.includes("--run")) || (rest.includes("--pr") && !/^\d+$/.test(pr ?? "")) || (rest.includes("--run") && !/^\d+$/.test(runId ?? ""))) {
      return { exit: 1, out: { ok: false, result: "usage: wait --pr <n> | --run <id>" } };
    }
    run.waiting = { kind: rest.includes("--pr") ? "pr" : "run", ...(rest.includes("--pr") ? { pr: Number(pr) } : { run: Number(runId) }), since: new Date().toISOString() };
    writeRun(file, run);
    return { exit: 0, out: { ok: true, result: "waiting", waiting: run.waiting } };
  }
  return { exit: 1, out: { ok: false, result: "usage: autopilot-run.mjs wait --pr <n> | --run <id> | wait-clear" } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = cliMain(process.argv.slice(2), process.env, process.cwd());
  process.stdout.write(JSON.stringify(r.out) + "\n");
  process.exit(r.exit);
}

export { cliMain };
