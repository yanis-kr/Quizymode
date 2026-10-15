#!/usr/bin/env node
// Dry-run demo: proves the Claude provider adapter can actually drive the
// real `claude` CLI end to end (subscription auth, real model call,
// project-level .claude/agents/<role>.md picked up via --agent) against a
// real open GitHub issue — read-only, no GitHub writes, no worktree edits.
//
// Usage: node scripts/automation/dry-run.mjs --issue <number> [--role architect]

import { parseArgs } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { runSpecialist, checkCliCapabilities } from "./claude-adapter.mjs";

const execFileAsync = promisify(execFileCb);

const { values } = parseArgs({
  options: {
    issue: { type: "string" },
    role: { type: "string", default: "architect" },
  },
});

if (!values.issue) {
  console.error("Usage: node scripts/automation/dry-run.mjs --issue <number> [--role architect]");
  process.exit(1);
}

const caps = await checkCliCapabilities();
console.log(
  `CLI ok: version=${caps.version} auth=${caps.authMethod} subscription=${caps.subscriptionType}`,
);

const { stdout: issueJson } = await execFileAsync("gh", [
  "issue",
  "view",
  values.issue,
  "--json",
  "number,title,body,state",
]);
const issue = JSON.parse(issueJson);
console.log(`Issue #${issue.number} [${issue.state}]: ${issue.title}`);

const prompt = [
  "Read-only dry run of the architect specialist role. Do not edit or write any",
  "files, do not call any GitHub-writing command. In 5 bullet points, summarize",
  `what you would flag before implementation for issue #${issue.number}`,
  `("${issue.title}"):`,
  "",
  issue.body ?? "(no body)",
].join("\n");

const out = await runSpecialist({
  role: values.role,
  prompt,
  allowedTools: ["Read", "Grep", "Glob"],
  permissionMode: "acceptEdits",
});

console.log(
  `\nmodel used: ${out.model}${out.modelSubstituted ? ` (substituted: ${out.modelSubstitutionReason})` : ""}`,
);
console.log(`session: ${out.sessionId}`);
console.log(`attempts: ${out.attempts}`);
console.log("\n--- result ---\n");
console.log(out.result.result ?? JSON.stringify(out.result, null, 2));
