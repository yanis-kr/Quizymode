#!/usr/bin/env node
// Token ledger for agent runs. Reads Claude Code transcripts (never prints message text, command text or tool results;
// it reads only usage, model, tool names, file paths of Read calls, agent type and timestamps).
//   node scripts/automation/usage-ledger.mjs --since 2026-11-10 [--root <dir>]
//   node scripts/automation/usage-ledger.mjs --session <id[,id]>
//   node scripts/automation/usage-ledger.mjs --issue 719 --sessions <id,id> [--size s] [--ledger-dir <dir>]   appends to .qm/ledger/issues.jsonl
// ccusage was not installed when this was written, and it has no per-issue or Read counts, so this is the custom version.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../validation/ac-lib.mjs";

const SAFE_NAME = /^[\w.:\-/]{1,80}$/;
const safe = (v, fallback) => (typeof v === "string" && SAFE_NAME.test(v) ? v : fallback);

function defaultRoots() {
  const base = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).filter((d) => /Quizymode($|-wt)/i.test(d)).map((d) => path.join(base, d));
}

function listJsonl(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "tool-results" ? [] : listJsonl(full);
    return e.name.endsWith(".jsonl") ? [full] : [];
  });
}

/** Reads transcripts and returns the aggregate. filters: { since?: date string, sessions?: string[] } */
export function buildLedger(roots, filters = {}) {
  const sinceMs = filters.since ? Date.parse(filters.since) : null;
  const sessionSet = filters.sessions?.length ? new Set(filters.sessions) : null;
  const messages = new Map(); // message id -> last entry seen
  const reads = new Map();
  const spawns = new Map();
  const seenTools = new Set();
  const seenSessions = new Set();
  let first = null;
  let last = null;

  for (const root of roots) {
    for (const file of listJsonl(root)) {
      const isSubFile = file.replace(/\\/g, "/").includes("/subagents/");
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line) continue;
        let o;
        try { o = JSON.parse(line); } catch { continue; }
        if (o.type !== "assistant" || !o.message) continue;
        const ts = Date.parse(o.timestamp);
        if (sinceMs !== null && !(ts >= sinceMs)) continue;
        const session = safe(o.sessionId, "unknown");
        if (sessionSet && !sessionSet.has(session)) continue;
        if (Number.isFinite(ts)) { first = first === null ? ts : Math.min(first, ts); last = last === null ? ts : Math.max(last, ts); }
        seenSessions.add(session);
        const sub = isSubFile || o.isSidechain === true;
        const u = o.message.usage;
        if (u && o.message.id) {
          const prev = messages.get(o.message.id);
          if (!prev || (u.output_tokens ?? 0) >= (prev.u.output_tokens ?? 0)) {
            messages.set(o.message.id, { u, model: safe(o.message.model, "unknown"), sub });
          }
        }
        for (const c of Array.isArray(o.message.content) ? o.message.content : []) {
          if (c?.type !== "tool_use") continue;
          if (c.id) { if (seenTools.has(c.id)) continue; seenTools.add(c.id); }
          if (c.name === "Read" && typeof c.input?.file_path === "string") {
            const p = c.input.file_path.replace(/\\/g, "/");
            reads.set(p, (reads.get(p) ?? 0) + 1);
          } else if (c.name === "Agent" || c.name === "Task") {
            const key = `${safe(c.input?.subagent_type, "(general)")} | ${safe(c.input?.model, "(none)")}`;
            spawns.set(key, (spawns.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  const byModel = {}; // "model | main|subagent" -> totals
  for (const { u, model, sub } of messages.values()) {
    const key = `${model} | ${sub ? "subagent" : "main"}`;
    const t = (byModel[key] ??= { turns: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
    t.turns += 1;
    t.input += u.input_tokens ?? 0;
    t.cacheRead += u.cache_read_input_tokens ?? 0;
    t.cacheWrite += u.cache_creation_input_tokens ?? 0;
    t.output += u.output_tokens ?? 0;
  }
  for (const t of Object.values(byModel)) t.avgContext = t.turns ? Math.round((t.input + t.cacheRead + t.cacheWrite) / t.turns) : 0;
  const topReads = [...reads.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([file, count]) => ({ file, count }));
  const agentSpawns = Object.fromEntries([...spawns.entries()].sort((a, b) => b[1] - a[1]));
  const wallMinutes = first !== null && last !== null ? Math.round((last - first) / 60000) : 0;
  return { sessions: [...seenSessions].sort(), messages: messages.size, byModel, topReads, agentSpawns, wallMinutes };
}

export function formatLedger(l) {
  const out = [`Sessions: ${l.sessions.length}  assistant messages (deduped by id): ${l.messages}  wall minutes: ${l.wallMinutes}`, "", "Per model and role: turns | cache read | cache write | output | avg context per turn"];
  for (const [k, t] of Object.entries(l.byModel).sort()) out.push(`  ${k}: ${t.turns} | ${t.cacheRead} | ${t.cacheWrite} | ${t.output} | ${t.avgContext}`);
  out.push("", "Top Read files:", ...l.topReads.map((r) => `  ${r.count}  ${r.file}`), "", "Agent spawns (type | model):", ...Object.entries(l.agentSpawns).map(([k, n]) => `  ${n}  ${k}`));
  return out.join("\n");
}

function ledgerFile(args) {
  if (typeof args["ledger-dir"] === "string") return path.join(path.resolve(args["ledger-dir"]), "issues.jsonl");
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  return path.join(path.dirname(common), ".qm", "ledger", "issues.jsonl");
}

export function issueLine(issue, size, l, now = new Date()) {
  const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let turns = 0;
  for (const t of Object.values(l.byModel)) { turns += t.turns; for (const k of Object.keys(tokens)) tokens[k] += t[k]; }
  const models = [...new Set(Object.keys(l.byModel).map((k) => k.split(" | ")[0]))].sort();
  return { issue, size: size ?? null, models, turns, tokens, wallMinutes: l.wallMinutes, sessions: l.sessions, at: now.toISOString() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const roots = typeof args.root === "string" ? [path.resolve(args.root)] : defaultRoots();
  const list = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  const sessions = list(args.sessions ?? args.session);
  if (args.issue !== undefined && !sessions.length) { console.error("--issue needs --sessions <id,id>"); process.exit(1); }
  if (args.since === undefined && !sessions.length) { console.error("Usage: usage-ledger.mjs (--since <date> | --session <id>) [--root <dir>] | --issue <n> --sessions <id,id> [--size xs|s|m|l]"); process.exit(1); }
  const ledger = buildLedger(roots, { since: typeof args.since === "string" ? args.since : undefined, sessions });
  console.log(formatLedger(ledger));
  if (args.issue !== undefined) {
    const file = ledgerFile(args);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(issueLine(Number(args.issue), typeof args.size === "string" ? args.size : undefined, ledger))}\n`, "utf8");
    console.log(`\nAppended issue ${args.issue} to ${file}`);
  }
}
