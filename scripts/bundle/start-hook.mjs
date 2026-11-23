#!/usr/bin/env node
// The owner's typed "start autopilot" (#761 gap 1, AC 7.19.29). A UserPromptSubmit hook: when the owner's whole message is
// "start autopilot" and exactly one bundle is waiting for approval, it approves that bundle through `bundle.mjs approve`
// with the hash the owner was shown in the brief (brief.json). Anything else changes nothing: no waiting bundle, two or
// more waiting bundles, a manifest that changed after the brief, or a message that only mentions the phrase.
// The approval itself is still verified by `approve` (checkUserReply, AC 7.19.19); this hook only supplies the chat text.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mainQmDir } from "./autopilot-run.mjs";

const BUNDLE = fileURLToPath(new URL("./bundle.mjs", import.meta.url));
// The whole message, nothing else: a sentence that quotes or negates the phrase is not the owner's go.
const START_MESSAGE = /^\s*start autopilot[.!]?\s*$/i;

function sha256File(p) { return createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function readJsonOrNull(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

/**
 * Bundles whose brief the owner was shown and whose manifest bytes are unchanged since, and that are not approved for those
 * bytes yet. A bundle that has started (state.json) or was cancelled (approval revoked) is not waiting.
 */
export function awaitingStart(bundlesDir) {
  if (!fs.existsSync(bundlesDir)) return [];
  const waiting = [];
  for (const bundleId of fs.readdirSync(bundlesDir)) {
    const dir = path.join(bundlesDir, bundleId);
    const manifest = path.join(dir, "manifest.json");
    const brief = readJsonOrNull(path.join(dir, "brief.json"));
    if (!brief || !fs.existsSync(manifest)) continue;
    if (fs.existsSync(path.join(dir, "state.json"))) continue;
    const sha = sha256File(manifest);
    if (brief.manifestSha256 !== sha) continue; // changed after the brief: the owner never saw these bytes
    const approval = readJsonOrNull(path.join(dir, "approval.json"));
    if (approval?.status === "revoked") continue;
    if (approval?.status === "approved" && approval.manifestSha256 === sha) continue;
    waiting.push({ bundleId, manifestSha256: sha });
  }
  return waiting;
}

/**
 * Decides what a prompt does. Returns { action: "none", reason? } or { action: "approve", bundleId, hash } where hash is the
 * 8-character prefix the owner was shown. Pure: no I/O.
 */
export function decideStart({ prompt, candidates }) {
  if (typeof prompt !== "string" || !START_MESSAGE.test(prompt)) return { action: "none" };
  if (candidates.length === 0) return { action: "none", reason: "No bundle is waiting for approval. Run /qm-bundle-autopilot first and read the brief it prints." };
  if (candidates.length > 1) {
    const ids = candidates.map((c) => c.bundleId).join(", ");
    return { action: "none", reason: `${candidates.length} bundles are waiting for approval (${ids}). Reply "approve <8-character hash>" for the one you mean.` };
  }
  const [only] = candidates;
  return { action: "approve", bundleId: only.bundleId, hash: only.manifestSha256.slice(0, 8) };
}

function emit(message) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: message } }) + "\n");
}

function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { return; }
  const prompt = input.prompt;
  if (typeof prompt !== "string" || !START_MESSAGE.test(prompt)) return; // the common case: silent and fast
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const decision = decideStart({ prompt, candidates: awaitingStart(path.join(mainQmDir(cwd), "bundles")) });
  if (decision.action === "none") { emit(decision.reason ?? ""); return; }
  const r = spawnSync(process.execPath, [BUNDLE, "approve", decision.bundleId, "--hash", decision.hash, "--user-reply", prompt.trim()], { cwd, encoding: "utf8" });
  if (r.status !== 0) { emit(`Bundle ${decision.bundleId} was not approved: ${(r.stdout || r.stderr || "").trim()}`); return; }
  emit(`Bundle ${decision.bundleId} is approved (manifest ${decision.hash}) by the owner's "start autopilot". The ship run is next: /qm-bundle-ship ${decision.bundleId}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
