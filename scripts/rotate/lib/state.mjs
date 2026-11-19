// Values-free run state: step names, statuses, timestamps and provider references (key ids), never a secret value.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadState(file, runId) {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  return { runId, startedAt: new Date().toISOString(), secrets: {}, redeployed: {} };
}

export function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2));
}
