// Shared helpers for the AC validation scripts (AC 7.10): parse docs/AC.md and find the Playwright tests that name an AC.
import fs from "node:fs";
import path from "node:path";

export const METHODS = ["unit", "e2e", "api", "sql", "anon-ui", "signed-in-prod-ui"];

/** Methods whose evidence is a Playwright test that names the AC, and the folder that test must live in. */
export const TEST_DIR_BY_METHOD = {
  e2e: "playwright/e2e-ci",
  "signed-in-prod-ui": "playwright/prod-verify",
};

const AC_LINE = /^\s*[-*]\s+\*\*AC (\d+(?:\.\d+)+)\*\*/;
const HEADING = /^#{2,4}\s/;
const VERIFY_TAG = /\[verify:\s*([^\]]*)\]/;
const ISSUE_REF = /#(\d+)\b/g;
const AC_ID_IN_TITLE = /\bAC (\d+(?:\.\d+)+)(?!\.?\d)/g;

function issueRefs(text) {
  return [...text.matchAll(ISSUE_REF)].map((match) => Number(match[1]));
}

/**
 * Parses AC lines. Each entry: { id, line, method (string | null), issues (number[]), text }.
 * An AC belongs to the issues named on its own line and on its nearest heading, e.g. "### AC 7.9 ... (#637)".
 */
export function parseAcMarkdown(markdown) {
  const acs = [];
  let headingIssues = [];
  markdown.split(/\r?\n/).forEach((raw, index) => {
    if (HEADING.test(raw)) {
      headingIssues = issueRefs(raw);
      return;
    }
    const match = AC_LINE.exec(raw);
    if (!match) return;
    const tag = VERIFY_TAG.exec(raw);
    acs.push({
      id: match[1],
      line: index + 1,
      method: tag ? tag[1].trim() : null,
      issues: [...new Set([...issueRefs(raw), ...headingIssues])],
      text: raw.trim(),
    });
  });
  return acs;
}

/** AC ids named in a test title, e.g. "AC 7.8.4 @e2e the API accepts ..." gives ["7.8.4"]. */
export function acIdsInTitle(title) {
  return [...title.matchAll(AC_ID_IN_TITLE)].map((match) => match[1]);
}

function listSpecFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSpecFiles(full);
    return /\.spec\.ts$/.test(entry.name) ? [full] : [];
  });
}

const TEST_TITLE = /\b(?:test|asUser|asAdmin|asAnon)(?:\.(?:only|fixme|skip|fail))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;

/** Map of AC id to the tests that name it, for every *.spec.ts under `dir`: { id: [{ file, title }] }. */
export function findAcTests(dir) {
  const byId = {};
  for (const file of listSpecFiles(dir)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(TEST_TITLE)) {
      const title = match[2];
      for (const id of acIdsInTitle(title)) {
        (byId[id] ??= []).push({ file: file.replace(/\\/g, "/"), title });
      }
    }
  }
  return byId;
}

/** Minimal `--flag value` / `--flag` parser. Repeated flags collect into an array. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith("--") ? true : argv[++i];
    args[key] = key in args ? [].concat(args[key], value) : value;
  }
  return args;
}

export function parseIssueList(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => Number(part.trim().replace(/^#/, "")))
    .filter((n) => Number.isInteger(n) && n > 0);
}
