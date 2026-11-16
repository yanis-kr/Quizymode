#!/usr/bin/env node
// Prints a slice of docs/AC.md instead of the whole 800 KB file. Uses ac-lib.mjs for AC parsing.
//   --issue <n>      ACs carrying (#n), grouped under their headings
//   --id <prefix>    ACs whose id is the prefix or starts with "<prefix>." (7.10 matches 7.10.1, not 7.1)
//   --heading <t>    the section whose heading contains t (case-insensitive), up to the next heading of the same or higher level
//   --headings       the heading outline only
//   --invariant <id>    one bullet of "Global invariants": its "Invariant <id>" line and sub-lines
//   --invariants-index  one line per invariant (id and title), no body
//   --max-lines <n>  cut the output after n lines (default 200) and say how many were cut
//   --file <path>    AC file (default docs/AC.md in the repo containing this script)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAcMarkdown, parseArgs, parseInvariants } from "./ac-lib.mjs";

const HEADING = /^(#{2,4})\s/;
const AC_LINE = /^\s*[-*]\s+\*\*AC \d+(?:\.\d+)+\*\*/;

/** Returns the slice as an array of lines. `args` uses the CLI flag names. */
export function sliceAc(markdown, args) {
  const lines = markdown.split(/\r?\n/);
  if (args["invariants-index"]) return parseInvariants(markdown).map((inv) => `${inv.id} – ${inv.title}`);
  if (args.invariant !== undefined) return parseInvariants(markdown).find((inv) => inv.id === String(args.invariant))?.lines ?? [];
  if (args.headings) return lines.filter((l) => HEADING.test(l));

  if (args.heading !== undefined) {
    const needle = String(args.heading).toLowerCase();
    const out = [];
    let level = 0;
    for (const line of lines) {
      const h = HEADING.exec(line);
      if (level && h && h[1].length <= level) level = 0;
      if (!level && h && line.toLowerCase().includes(needle)) level = h[1].length;
      if (level) out.push(line);
    }
    return out;
  }

  let wanted;
  if (args.issue !== undefined) {
    const n = Number(args.issue);
    wanted = (ac) => ac.issues.includes(n);
  } else if (args.id !== undefined) {
    const prefix = String(args.id);
    wanted = (ac) => ac.id === prefix || ac.id.startsWith(`${prefix}.`);
  } else {
    return [];
  }
  const hits = new Set(parseAcMarkdown(markdown).filter(wanted).map((ac) => ac.line));
  const out = [];
  let heading = "";
  let emittedHeading = "";
  for (let i = 0; i < lines.length; i += 1) {
    if (HEADING.test(lines[i])) { heading = lines[i]; continue; }
    if (!hits.has(i + 1)) continue;
    if (heading !== emittedHeading) {
      if (out.length) out.push("");
      out.push(heading);
      emittedHeading = heading;
    }
    out.push(lines[i]);
    for (let j = i + 1; j < lines.length && !HEADING.test(lines[j]) && !AC_LINE.test(lines[j]) && lines[j].trim() !== ""; j += 1) out.push(lines[j]);
  }
  return out;
}

export function render(lines, maxLines) {
  if (lines.length <= maxLines) return lines.join("\n");
  const cut = lines.length - maxLines;
  return `${lines.slice(0, maxLines).join("\n")}\n... ${cut} more lines cut (raise --max-lines or narrow the slice)`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = typeof args.file === "string" ? args.file : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "AC.md");
  if (args.issue === undefined && args.id === undefined && args.heading === undefined && !args.headings && args.invariant === undefined && !args["invariants-index"]) {
    console.error("Usage: ac-slice.mjs (--issue <n> | --id <prefix> | --heading <text> | --headings | --invariant <id> | --invariants-index) [--max-lines <n>] [--file <path>]");
    process.exit(1);
  }
  const maxLines = args["max-lines"] === undefined ? 200 : Number(args["max-lines"]);
  const lines = sliceAc(fs.readFileSync(file, "utf8"), args);
  if (!lines.length) { console.error("No match."); process.exit(2); }
  console.log(render(lines, maxLines));
}
