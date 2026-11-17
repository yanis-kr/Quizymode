#!/usr/bin/env node
// Counts questions an autopilot run put to the owner (#760 AC 6). Usage: node scripts/automation/ask-audit.mjs <transcript.jsonl>
// Prints JSON: askUserQuestionCalls (tool calls) and turnEndingQuestions (an assistant turn that ends with a question and
// the next message is the owner's). Tool results inside a turn do not end it.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function auditTranscript(text) {
  let askUserQuestionCalls = 0;
  let turnEndingQuestions = 0;
  let lastAssistantText = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let entry;
    try { entry = JSON.parse(raw); } catch { continue; }
    const msg = entry.message ?? entry;
    const content = Array.isArray(msg.content) ? msg.content : typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : [];
    if (entry.type === "assistant" || msg.role === "assistant") {
      const toolUses = content.filter((c) => c.type === "tool_use");
      askUserQuestionCalls += toolUses.filter((c) => c.name === "AskUserQuestion").length;
      const texts = content.filter((c) => c.type === "text" && c.text?.trim()).map((c) => c.text.trim());
      // A turn that calls tools is still going; only plain text can end it.
      lastAssistantText = toolUses.length === 0 && texts.length ? texts[texts.length - 1] : null;
    } else if (entry.type === "user" || msg.role === "user") {
      const isToolResult = content.some((c) => c.type === "tool_result");
      const isOwner = !isToolResult && content.some((c) => c.type === "text" && c.text?.trim());
      if (isOwner) {
        if (lastAssistantText && /\?\s*$/.test(lastAssistantText)) turnEndingQuestions += 1;
        lastAssistantText = null;
      }
    }
  }
  return { askUserQuestionCalls, turnEndingQuestions };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("usage: ask-audit.mjs <transcript.jsonl>\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(auditTranscript(fs.readFileSync(file, "utf8")), null, 2) + "\n");
}
