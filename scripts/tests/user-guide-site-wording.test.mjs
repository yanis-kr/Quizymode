// Run with: node --test scripts/tests/user-guide-site-wording.test.mjs
// The page written by build-user-guide-site.js says questions and topics, not items or sets (AC 2.2.11, #934).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { orderedSlugs } from "../generate-user-guide.js";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "build-user-guide-site.js");

/** Text a reader sees: no scripts, styles, tags, slug captions (file names) or addresses. */
function visibleText(html) {
  const text = [];
  let hidden = null; // name of the element whose content is being skipped
  // Splitting on a capture group puts the tags at the odd positions.
  html.split(/(<\/?[a-z!][^<>]*>)/i).forEach((part, index) => {
    if (index % 2 === 0) {
      if (!hidden) text.push(part);
      return;
    }
    const name = /^<\/?([a-z]+)/i.exec(part)?.[1].toLowerCase();
    if (hidden) {
      if (part.startsWith("</") && name === hidden) hidden = null;
    } else if (name === "script" || name === "style" || part.includes('class="guide-step__slug"')) {
      hidden = name;
    }
  });
  return text
    .join(" ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ");
}

test("the guide site page uses questions and topics, not items or sets (#934)", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "qm-guide-site-"));
  try {
    const shotRoot = path.join(work, "shots");
    const outputDir = path.join(work, "site");
    const desktopDir = path.join(shotRoot, "dark", "desktop");
    fs.mkdirSync(desktopDir, { recursive: true });
    orderedSlugs.forEach((slug, index) => {
      fs.writeFileSync(path.join(desktopDir, `${String(index + 1).padStart(2, "0")}.${slug}.png`), "");
    });

    execFileSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        USER_GUIDE_SCREENSHOT_ROOT: shotRoot,
        USER_GUIDE_SITE_OUTPUT_DIR: outputDir,
        USER_GUIDE_GENERATED_AT: "2026-11-28T00:00:00.000Z",
      },
      stdio: "pipe",
    });

    const text = visibleText(fs.readFileSync(path.join(outputDir, "index.html"), "utf8"));
    assert.match(text, /questions/i);
    // Nouns only: "set" as a verb ("you can set it as the active collection") is fine.
    assert.doesNotMatch(text, /\b(items?|sets)\b/i);
    assert.doesNotMatch(text, /\b(a|an|the|this|that|each|every|your|my|one|question|study) set\b/i);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
