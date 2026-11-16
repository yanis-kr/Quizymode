#!/usr/bin/env node
// AC 7.11.7: reads the change scope CI uploaded, for Deploy. Only an explicit JSON false turns a flag off.
// Fail safe: a missing file, invalid JSON or a missing key deploys everything (true), as AC 7.11.3 requires.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function readScope(text) {
  const fallback = { web: true, api: true };
  if (text === null || text === undefined) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
  return {
    web: parsed.web === false ? false : true,
    api: parsed.api === false ? false : true,
  };
}

// CLI: node scripts/ci/read-change-scope.mjs <file>  prints "web=<bool> api=<bool>" on stdout.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const file = process.argv[2];
  let text = null;
  if (file) {
    try {
      text = readFileSync(file, "utf8");
    } catch {
      text = null;
    }
  }
  const scope = readScope(text);
  process.stdout.write(`web=${scope.web} api=${scope.api}\n`);
}
