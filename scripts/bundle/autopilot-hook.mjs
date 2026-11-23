#!/usr/bin/env node
// Hooks for the autopilot run (#760). Usage: node scripts/bundle/autopilot-hook.mjs ask|stop
//   ask  (PreToolUse on AskUserQuestion): denies the question while a live run owns this session.
//   stop (Stop): blocks the stop while the run phase is not terminal, and allows it after
//        STALL_AFTER_BLOCKS consecutive blocks with an unchanged bundle state (the run is then marked stalled).
// Both do nothing when there is no run file, when the run belongs to another session, or when the kill switch
// (deleting run.json, or bundle.mjs cancel) has been used. The hook input arrives on stdin as JSON.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readRun, writeRun, runFilePath, isLiveRunFor, isWaiting, mainQmDir, STALL_AFTER_BLOCKS } from "./autopilot-run.mjs";

const mode = process.argv[2];

function readInput() {
  try {
    const text = fs.readFileSync(0, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function stateHash(qmDir, bundleId) {
  const file = path.join(qmDir, "bundles", bundleId ?? "", "state.json");
  if (!bundleId || !fs.existsSync(file)) return "none";
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
// Progress is a change to state.json or a move of any local branch (AC 7.19.22). Lane work commits between bundle
// commands without touching state.json, so a branch move counts. Before this, a working run stalled after three blocks.
function progressHash(qmDir, bundleId, cwd) {
  const refs = spawnSync("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"], { cwd: cwd || process.cwd(), encoding: "utf8" });
  const heads = refs.status === 0 ? refs.stdout : "";
  return createHash("sha256").update(`${stateHash(qmDir, bundleId)}\n${heads}`).digest("hex");
}

export function main(argv = { mode, env: process.env, input: null, cwd: process.cwd() }) {
  const input = argv.input ?? readInput();
  // QM_DIR lets tests (and the hook itself, when git is not needed) point at a .qm folder directly.
  const qmDir = argv.env.QM_DIR ? path.resolve(argv.env.QM_DIR) : mainQmDir(argv.cwd);
  const file = runFilePath(qmDir);
  if (!fs.existsSync(file)) return { exit: 0 };
  const run = readRun(file);
  if (!isLiveRunFor(run, input.session_id)) return { exit: 0 };

  if (argv.mode === "ask") {
    if (input.tool_name !== "AskUserQuestion") return { exit: 0 };
    return {
      exit: 0,
      out: {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Autopilot run: do not ask the owner. Ask qm-lead instead, or park the question in the final report.",
        },
      },
    };
  }

  if (argv.mode === "stop") {
    // Waiting on CI or Deploy (AC 7.19.20): the turn may end; the PR monitor or the background watch resumes the run.
    if (isWaiting(run)) {
      run.stopBlocks = 0;
      writeRun(file, run);
      return { exit: 0 };
    }
    const hash = progressHash(qmDir, run.bundleId, argv.cwd);
    const unchanged = run.lastStateHash === hash;
    run.stopBlocks = unchanged ? (run.stopBlocks ?? 0) + 1 : 1;
    run.lastStateHash = hash;
    if (run.stopBlocks > STALL_AFTER_BLOCKS) {
      run.stalled = true;
      writeRun(file, run);
      return { exit: 0 };
    }
    writeRun(file, run);
    return {
      exit: 0,
      out: {
        decision: "block",
        reason: `Bundle ${run.bundleId} is in phase ${run.phase}. Continue the run: BUNDLE checkpoint, then the next step of the skill. Do not stop until the phase is terminal.`,
      },
    };
  }
  return { exit: 0 };
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (mode !== "ask" && mode !== "stop") {
    process.stderr.write("usage: autopilot-hook.mjs ask|stop\n");
    process.exit(0);
  }
  const result = main({ mode, env: process.env, input: null, cwd: process.cwd() });
  if (result.out) emit(result.out);
  process.exit(result.exit);
}
