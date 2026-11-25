// Tests for #760 AC 6: ask-audit counts AskUserQuestion calls and turn-ending questions in a transcript.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditTranscript } from "../automation/ask-audit.mjs";

// Temp folders this file makes are removed when the file ends, so %TEMP% does not collect qm-* folders (#761).
const madeDirs = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); madeDirs.push(d); return d; };
after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUDIT = path.join(repo, "scripts", "automation", "ask-audit.mjs");

const line = (obj) => JSON.stringify(obj);
const assistantText = (text) => line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
const assistantTool = (name) => line({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name, input: {} }] } });
const ownerText = (text) => line({ type: "user", message: { role: "user", content: [{ type: "text", text }] } });
const toolResult = () => line({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } });

test("AC6: counts AskUserQuestion calls and turn-ending questions for a fixture transcript", () => {
  const transcript = [
    assistantText("Starting."),
    assistantTool("Read"),
    toolResult(),
    assistantTool("AskUserQuestion"),
    toolResult(),
    assistantText("Which lane should go first?"),
    ownerText("lane a"),
    assistantText("Done. Shipped #760."),
    ownerText("thanks"),
  ].join("\n");
  assert.deepEqual(auditTranscript(transcript), { askUserQuestionCalls: 1, turnEndingQuestions: 1 });
});

test("AC6: the CLI prints the same counts for a file", () => {
  const dir = mkTmp("audit-760-");
  const file = path.join(dir, "t.jsonl");
  fs.writeFileSync(file, [assistantTool("AskUserQuestion"), assistantText("Ready?"), ownerText("yes")].join("\n") + "\n");
  const r = spawnSync(process.execPath, [AUDIT, file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { askUserQuestionCalls: 1, turnEndingQuestions: 1 });
});
