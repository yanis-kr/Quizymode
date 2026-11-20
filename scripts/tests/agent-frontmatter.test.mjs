// Every agent and skill definition has frontmatter that parses (AC 7.19.17).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const files = [
  ...fs.readdirSync(".claude/agents").filter((f) => f.endsWith(".md")).map((f) => path.join(".claude/agents", f)),
  ...fs.readdirSync(".claude/skills")
    .map((d) => path.join(".claude/skills", d, "SKILL.md"))
    .filter((p) => fs.existsSync(p)),
];

function frontmatterLines(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  assert.equal(lines[0], "---", `${file} starts with a frontmatter fence`);
  const end = lines.indexOf("---", 1);
  assert.ok(end > 0, `${file} closes its frontmatter`);
  return lines.slice(1, end);
}

test("AC 7.19.17: every agent and skill has a name and a description that parse as YAML", () => {
  assert.ok(files.length >= 8, "found the agent and skill definitions");
  for (const file of files) {
    const fields = new Map();
    for (const line of frontmatterLines(file)) {
      const m = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(line);
      if (m) fields.set(m[1], m[2]);
    }
    assert.ok(fields.get("name"), `${file} has a name`);
    const description = fields.get("description");
    assert.ok(description, `${file} has a description`);
    const quoted = /^(["']).*\1$/.test(description);
    // A plain (unquoted) YAML value cannot contain ': ', or the parser reads a nested mapping and rejects the file.
    if (!quoted) {
      assert.doesNotMatch(description, /: /, `${file}: description has ': ' and must be quoted`);
    }
  }
});
