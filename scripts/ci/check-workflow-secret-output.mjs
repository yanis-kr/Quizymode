#!/usr/bin/env node
// AC 7.11.20: workflows must never print the Lightsail container environment (it holds secrets) and every `run:` block
// must be valid bash. Usage: node scripts/ci/check-workflow-secret-output.mjs [workflow.yml ...]
// Without arguments it checks every file in .github/workflows/.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const GUARDED_COMMANDS = [
  "create-container-service-deployment",
  "get-container-service-deployments",
  "get-container-services",
];

/** The `shell:` of the step that contains line `i` (indent `indent`), or "" when the step has none. */
function stepShell(lines, i, indent) {
  const indentOf = (line) => line.length - line.trimStart().length;
  const shellOf = (line) => /^\s*(?:-\s+)?shell:\s*(\S+)/.exec(line)?.[1] ?? "";
  for (let j = i - 1; j >= 0; j--) {
    if (lines[j].trim() === "") continue;
    if (indentOf(lines[j]) < indent - 2) break;
    if (shellOf(lines[j])) return shellOf(lines[j]);
    if (/^\s*-\s/.test(lines[j])) break;
  }
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === "") continue;
    if (indentOf(lines[j]) < indent || /^\s*-\s/.test(lines[j]) && indentOf(lines[j]) < indent) break;
    if (shellOf(lines[j]) && indentOf(lines[j]) === indent) return shellOf(lines[j]);
  }
  return "";
}

/** Returns the bash text of every `run:` step (steps using another shell are skipped), YAML indent removed. */
export function extractRunBlocks(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const indent = match[1].length + (lines[i].trimStart().startsWith("-") ? 2 : 0);
    const shell = stepShell(lines, i, indent);
    const skip = shell !== "" && !/^(bash|sh)\b/.test(shell);
    const rest = match[2].trim();
    if (/^[|>][-+]?$/.test(rest)) {
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === "") { body.push(""); continue; }
        if (line.length - line.trimStart().length <= indent) break;
        body.push(line);
      }
      const common = Math.min(...body.filter((l) => l.trim() !== "").map((l) => l.length - l.trimStart().length));
      if (!skip) blocks.push({ line: i + 1, text: body.map((l) => l.slice(Number.isFinite(common) ? common : 0)).join("\n") });
      i = j - 1;
    } else if (rest && !skip) {
      blocks.push({ line: i + 1, text: rest });
    }
  }
  return blocks;
}

/** The text of the shell statement that starts at `start`: stops at an unquoted newline, pipe, `;`, `&&` or `)`. */
function statementFrom(text, start) {
  let quote = null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "\\") {
      i++; // an escaped newline continues the statement
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "(") depth++;
    if (c === ")") { if (depth === 0) return text.slice(start, i); depth--; }
    if (c === "\n" || c === ";" || (c === "|" && text[i + 1] !== "|") || (c === "&" && text[i + 1] === "&")) {
      return text.slice(start, i);
    }
  }
  return text.slice(start);
}

/** Text outside quotes only, so a `>` inside JSON or a jq filter is not mistaken for a redirect. */
function unquoted(statement) {
  let out = "";
  let quote = null;
  for (let i = 0; i < statement.length; i++) {
    const c = statement[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "\\") { out += " "; i++; continue; }
    if (c === "'" || c === '"') { quote = c; out += " "; continue; }
    out += c;
  }
  return out;
}

function redirectsStdout(statement) {
  // `> file`, `>> file`, `1> file`; not `2> file` or `>&2`.
  return /(^|[\s])(1?>>?)(?!&)\s*\S/.test(unquoted(statement));
}

function queryAvoidsEnvironment(statement) {
  const match = /--query\s+(?:'([^']*)'|"([^"]*)")/.exec(statement);
  return Boolean(match) && !/environment/i.test(match[1] ?? match[2]);
}

export function bashSyntaxErrors(text) {
  const cleaned = text.replace(/\$\{\{[\s\S]*?\}\}/g, "EXPR");
  const result = spawnSync("bash", ["-n"], { input: cleaned, encoding: "utf8" });
  if (result.error) return [`bash is not available to check syntax: ${result.error.message}`];
  return result.status === 0 ? [] : [result.stderr.trim().split("\n")[0]];
}

export function checkWorkflow(yamlText, name = "workflow") {
  const problems = [];
  for (const block of extractRunBlocks(yamlText)) {
    const where = `${name}:${block.line}`;
    for (const error of bashSyntaxErrors(block.text)) problems.push(`${where}: bash -n: ${error}`);
    // `bash -n` accepts `aws x + --option`: the `+` is just an argument, so a broken `\` continuation needs its own rule.
    if (/\s\+\s+--?[A-Za-z]/.test(block.text)) problems.push(`${where}: stray "+" before an option (broken line continuation, use "\\")`);
    if (/(^|\n)\s*set\s+-[a-z]*x/.test(block.text)) problems.push(`${where}: set -x can print secrets`);
    if (/\b(cat|echo|printf|tee|head|tail|less|more)\b[^\n|;&]*\/tmp\/env\.json/.test(block.text)) {
      problems.push(`${where}: prints /tmp/env.json`);
    }
    for (const command of GUARDED_COMMANDS) {
      let from = 0;
      for (;;) {
        const at = block.text.indexOf(`aws lightsail ${command}`, from);
        if (at < 0) break;
        from = at + 1;
        const statement = statementFrom(block.text, at);
        if (!redirectsStdout(statement) && !queryAvoidsEnvironment(statement)) {
          problems.push(`${where}: ${command} prints its response (redirect stdout, or use --query without "environment")`);
        }
      }
    }
  }
  if (yamlText.includes("/tmp/env.json") && !/if:\s*always\(\)[\s\S]*?rm\s+-f[^\n]*\/tmp\/env\.json/.test(yamlText)) {
    problems.push(`${name}: /tmp/env.json is not removed by an if: always() step`);
  }
  return problems;
}

function main(argv) {
  const dir = ".github/workflows";
  const files = argv.length ? argv : readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(dir, f));
  const problems = files.flatMap((file) => checkWorkflow(readFileSync(file, "utf8"), file));
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log(`workflow secret-output guard: ${files.length} file(s) ok`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
