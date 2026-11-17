// Run file for an autopilot run (#760): .qm/autopilot/run.json under the main checkout's .qm folder.
// bundle.mjs writes it; the PreToolUse and Stop hooks in autopilot-hook.mjs read it. No run file means both hooks do nothing.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
