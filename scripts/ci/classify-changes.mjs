#!/usr/bin/env node
// AC 7.11.1: decides which parts of the app a change touches, so CI and Deploy can skip work the change cannot affect.
// Fail safe: a path no rule names counts as both web and api, and any git failure runs everything.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const NONE_PREFIXES = [
  ".claude/", ".codex/", ".agent-skills/", "scripts/automation/", "scripts/validation/", "scripts/tests/",
  "scripts/ci/", "scripts/release/", "scripts/bundle/", "docs/",
];
const NONE_FILES = ["AGENTS.md", "CLAUDE.md", "README.md", "LICENSE.txt", ".gitignore", ".gitattributes"];
// Documents under docs/ that the backend reads or that describe its contract.
const API_PREFIXES_UNDER_DOCS = ["docs/openapi/", "docs/quizymode_taxonomy"];
const WEB_PREFIXES = ["src/Quizymode.Web/", "playwright/"];
const WEB_FILES = ["package.json", "package-lock.json", "playwright.config.ts"];
const API_PREFIXES = ["src/Quizymode.Api", "src/Quizymode.Taxonomy/", "tests/"];
const API_FILES = ["Directory.Packages.props", "global.json", ".dockerignore", "Quizymode.sln"];
// Item content that prod seed sync reads from GitHub. The API image does not contain it, so a change here needs the
// API tests (several read it) but no build or deploy. `data/seed-source/collections/` stays full scope: the startup
// seeder reads it.
const ITEM_DATA_PREFIXES = ["data/seed-source/items/", "data/seed-source/_registry/"];
const SHARED_PREFIXES = [".github/workflows/", "data/"];
// A change to these files that only touches the version line is a release bump: it sets web and api (AC 7.11.30).
const VERSION_ONLY_FILES = [
  "Directory.Build.props", "src/Quizymode.Web/package.json", "src/Quizymode.Web/package-lock.json",
];

const everything = () => ({ web: true, api: true, apiTests: true, any: true });

export function classifyFile(file) {
  const startsWith = (list) => list.some((p) => file.startsWith(p));
  if (startsWith(ITEM_DATA_PREFIXES)) return { web: false, api: false, apiTests: true };
  if (startsWith(SHARED_PREFIXES)) return { web: true, api: true };
  if (startsWith(API_PREFIXES_UNDER_DOCS)) return { web: false, api: true };
  if (startsWith(NONE_PREFIXES) || NONE_FILES.includes(file)) return { web: false, api: false };
  if (startsWith(WEB_PREFIXES) || WEB_FILES.includes(file)) return { web: true, api: false };
  if (startsWith(API_PREFIXES) || API_FILES.includes(file) || file === "Directory.Build.props") {
    return { web: false, api: true };
  }
  return { web: true, api: true };
}

// files: [{ path, versionOnly }]
export function classify(files) {
  const scope = { web: false, api: false };
  let testsOnly = false;
  for (const f of files) {
    // A version-only bump still redeploys both, so prod reports the version main carries (AC 7.11.30).
    if (f.versionOnly) {
      scope.web = true;
      scope.api = true;
      continue;
    }
    const c = classifyFile(f.path);
    scope.web ||= c.web;
    scope.api ||= c.api;
    testsOnly ||= Boolean(c.apiTests);
  }
  // apiTests: the API tests must run. True whenever api is set, and for item-data-only changes (no build, no deploy).
  return { ...scope, apiTests: scope.api || testsOnly, any: scope.web || scope.api };
}

// True when every changed line of a unified diff (-U0) is a version line.
export function isVersionOnlyDiff(diffText) {
  const changed = diffText
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"));
  return changed.length > 0 && changed.every((l) => /QuizymodeVersion|"version"\s*:/.test(l));
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function classifyRange(base, head) {
  const names = git(["diff", "--name-only", `${base}`, head]).split("\n").filter(Boolean);
  const files = names.map((path) => ({
    path,
    versionOnly: VERSION_ONLY_FILES.includes(path) && isVersionOnlyDiff(git(["diff", "-U0", base, head, "--", path])),
  }));
  return classify(files);
}

function main() {
  const [base, head = "HEAD"] = process.argv.slice(2);
  let scope;
  try {
    if (!base || /^0+$/.test(base)) throw new Error("no base commit");
    scope = classifyRange(base, head);
  } catch (error) {
    console.error(`classify-changes: ${error.message}; running everything.`);
    scope = everything();
  }
  console.log(JSON.stringify(scope));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `web=${scope.web}\napi=${scope.api}\napiTests=${scope.apiTests}\nany=${scope.any}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
