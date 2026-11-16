// Tests for #719: ac-slice.mjs, bundle.mjs packet/handback-check, usage-ledger.mjs and the agent/skill wiring.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sliceAc, render } from "../validation/ac-slice.mjs";
import { buildLedger, formatLedger, issueLine } from "../automation/usage-ledger.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repo, ".claude", "skills", "qm-implement-bundle", "scripts", "bundle.mjs");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "qm-719-"));
const run = (args) => spawnSync("node", [BUNDLE, ...args], { encoding: "utf8" });

const AC_FIXTURE = `# AC
## Alpha
### AC 7.1 Older (#10)
- **AC 7.1.1** [Dev] [verify: unit] Seven one one.
### AC 7.10 Newer (#20)
- **AC 7.10.1** [Dev] [verify: unit] Ten one.
  continuation line
- **AC 7.10.2** [Dev] [verify: unit] Ten two (#21).
## Beta
- **AC 8.1.1** [Dev] [verify: api] Eight one (#20).
`;

test("AC ac-slice --issue prints exactly the ACs carrying the issue, with headings", () => {
  const out = sliceAc(AC_FIXTURE, { issue: "20" }).join("\n");
  assert.match(out, /### AC 7\.10 Newer/);
  assert.match(out, /AC 7\.10\.1/);
  assert.match(out, /continuation line/);
  assert.match(out, /## Beta/);
  assert.match(out, /AC 8\.1\.1/);
  assert.doesNotMatch(out, /AC 7\.1\.1/);
  assert.equal(sliceAc(AC_FIXTURE, { issue: "21" }).filter((l) => l.includes("**AC")).length, 1);
});

test("AC ac-slice --id 7.10 prints every AC 7.10.x and no other", () => {
  const lines = sliceAc(AC_FIXTURE, { id: "7.10" }).filter((l) => l.includes("**AC"));
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.includes("**AC 7.10.")));
  assert.equal(sliceAc(AC_FIXTURE, { id: "7.1" }).filter((l) => l.includes("**AC")).length, 1);
});

test("AC ac-slice --headings prints no AC lines and --heading prints one section", () => {
  const outline = sliceAc(AC_FIXTURE, { headings: true });
  assert.ok(outline.length >= 4);
  assert.ok(outline.every((l) => l.startsWith("#")));
  const section = sliceAc(AC_FIXTURE, { heading: "newer" }).join("\n");
  assert.match(section, /AC 7\.10\.1/);
  assert.doesNotMatch(section, /AC 8\.1\.1|AC 7\.1\.1/);
});

test("AC ac-slice cuts a slice over --max-lines and says by how much", () => {
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
  const out = render(lines, 4).split("\n");
  assert.equal(out.length, 5);
  assert.match(out[4], /6 more lines cut/);
  assert.equal(render(lines, 10), lines.join("\n"));
});

function writeBundle(dir, { size, risk = "low", migration = false } = {}) {
  const id = "test-bundle";
  const bdir = path.join(dir, id);
  fs.mkdirSync(bdir, { recursive: true });
  const m = {
    schemaVersion: 1, bundleId: id, title: "T", repo: { nameWithOwner: "o/r" },
    source: { commit: "a".repeat(40), baseBranch: "main" }, versionBump: "patch", excluded: [], releaseMode: "release-pr-only",
    branches: { release: "release/x", issuePrefix: "bundle/x/" },
    authorization: { mergeToMain: false, migrations: "any-reviewed", paidServices: false, infraChanges: "none", prodDataWrites: "none", rollback: "report-only" },
    limits: { maxAttemptsPerIssue: 2, maxCiRuns: 3, maxWallClockHours: 4, lockStaleMinutes: 30 },
    releaseGates: ["g"], policies: { partialRelease: "all-or-nothing", blockedIssue: "stop-bundle", sourceDrift: "stop-on-any" },
    issues: [{
      number: 20, title: "Slice issue", order: 1, size, snapshot: { updatedAt: "x", bodySha256: "b".repeat(64) }, risk, ux: false, migration, dependsOn: [],
      scope: { summary: "Do the thing.", paths: ["src/Quizymode.Web/src/features/Example/**", "scripts/validation/**"], exclusions: ["Not the other thing"] },
      acceptanceCriteria: [{ id: "AC1", text: "Observable behavior", evidence: "unit" }], validation: ["npm test -- --run Example"],
    }],
  };
  const manifest = path.join(bdir, "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify(m, null, 2));
  const sha = createHash("sha256").update(fs.readFileSync(manifest)).digest("hex");
  fs.writeFileSync(path.join(bdir, "approval.json"), JSON.stringify({ status: "approved", manifestSha256: sha }));
  return id;
}

function packet(dir, issue, extra = [], bundleOpts = {}) {
  const id = writeBundle(path.join(dir, "bundles"), bundleOpts);
  const acFile = path.join(dir, "AC.md");
  fs.writeFileSync(acFile, AC_FIXTURE);
  const r = run(["packet", id, String(issue), "--bundles-dir", path.join(dir, "bundles"), "--packets-dir", path.join(dir, "packets"), "--handbacks-dir", path.join(dir, "hb"), "--ac-file", acFile, "--no-git", ...extra]);
  return { r, file: path.join(dir, "packets", `${issue}.md`) };
}

test("AC bundle packet writes ACs, exclusions, paths, checks and model, and rejects an issue outside the manifest", () => {
  const dir = tmp();
  const { r, file } = packet(dir, 20, [], { size: "s" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /model: sonnet/);
  assert.match(text, /AC1 \[verify: unit\] Observable behavior/);
  assert.match(text, /Not the other thing/);
  assert.match(text, /src\/Quizymode\.Web\/src\/features\/Example\/\*\*/);
  assert.match(text, /npx vitest related --run src\/Quizymode\.Web\/src\/features\/Example/);
  assert.match(text, /node scripts\/validation\/ac-gate\.mjs --issues 20/);
  assert.match(text, /AC 8\.1\.1/);
  assert.match(text, /hb\/20-<role>\.json/);
  const bad = packet(tmp(), 99);
  assert.equal(bad.r.status, 2);
  assert.match(bad.r.stdout, /not in bundle/);
});

test("AC packet model is sonnet for xs/s/m, opus for risk high or migration, one tier up on attempt 2", () => {
  const model = (bundleOpts, extra = []) => {
    const dir = tmp();
    const { r, file } = packet(dir, 20, extra, bundleOpts);
    assert.equal(r.status, 0, r.stdout);
    return /model: (\w+)/.exec(fs.readFileSync(file, "utf8"))[1];
  };
  for (const size of ["xs", "s", "m"]) assert.equal(model({ size }), "sonnet");
  assert.equal(model({ size: "s", risk: "high" }), "opus");
  assert.equal(model({ size: "s", migration: true }), "opus");
  assert.equal(model({ size: "s" }, ["--attempt", "2"]), "opus");
  assert.equal(model({ size: "s", risk: "high" }, ["--attempt", "2"]), "opus");
});

test("AC packet --from-issue builds a packet from the draft ACs and labels", () => {
  const dir = tmp();
  const json = path.join(dir, "issue.json");
  fs.writeFileSync(json, JSON.stringify({ title: "Thing", labels: [{ name: "size:m" }], body: "## Draft ACs\n- AC (draft) [verify: unit] It works.\nOut of scope: hooks\n" }));
  const r = run(["packet", "--from-issue", "5", "--issue-json", json, "--packets-dir", path.join(dir, "p"), "--handbacks-dir", path.join(dir, "h"), "--ac-file", path.join(dir, "none.md")]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(dir, "p", "5.md"), "utf8");
  assert.match(text, /model: sonnet/);
  assert.match(text, /It works\./);
  assert.match(text, /hooks/);
});

test("AC handback-check accepts a valid handback and names the missing field", () => {
  const dir = tmp();
  const valid = { status: "done", filesChanged: ["a.mjs"], commands: [{ command: "node --test", exitCode: 0 }], acEvidence: { AC1: "scripts/tests/x.test.mjs" }, questions: [] };
  const check = (h) => {
    const f = path.join(dir, "h.json");
    fs.writeFileSync(f, JSON.stringify(h));
    return run(["handback-check", f]);
  };
  assert.equal(check(valid).status, 0);
  for (const field of ["status", "commands", "acEvidence"]) {
    const { [field]: _removed, ...rest } = valid;
    const r = check(rest);
    assert.equal(r.status, 2, field);
    assert.match(r.stdout, new RegExp(field), field);
  }
});

const SECRET_TEXT = "SECRET-MESSAGE-TEXT-xyz";
const SECRET_CMD = "curl --header SECRET-COMMAND-abc";

function writeTranscripts(root) {
  const usage = (out) => ({ input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100, output_tokens: out });
  const a = (id, sid, ts, model, out, content, extra = {}) => JSON.stringify({ type: "assistant", sessionId: sid, timestamp: ts, ...extra, message: { id, model, usage: usage(out), content } });
  const main = [
    a("m1", "s1", "2026-11-10T10:00:00Z", "claude-opus-5-5", 1, [{ type: "text", text: SECRET_TEXT }]),
    a("m1", "s1", "2026-11-10T10:00:01Z", "claude-opus-5-5", 50, [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/r/docs/AC.md" } }]),
    a("m2", "s1", "2026-11-10T10:30:00Z", "claude-opus-5-5", 20, [
      { type: "tool_use", id: "t2", name: "Read", input: { file_path: "/r/docs/AC.md" } },
      { type: "tool_use", id: "t3", name: "Bash", input: { command: SECRET_CMD } },
      { type: "tool_use", id: "t4", name: "Agent", input: { subagent_type: "coder", model: "sonnet", prompt: SECRET_TEXT } },
    ]),
  ];
  const sub = [a("m3", "s1", "2026-11-10T10:10:00Z", "claude-sonnet-5-5", 5, [{ type: "tool_use", id: "t5", name: "Read", input: { file_path: "/r/a.cs" } }], { isSidechain: true })];
  fs.mkdirSync(path.join(root, "s1", "subagents"), { recursive: true });
  fs.writeFileSync(path.join(root, "s1.jsonl"), main.join("\n"));
  fs.writeFileSync(path.join(root, "s1", "subagents", "agent-1.jsonl"), sub.join("\n"));
}

test("AC usage-ledger counts each message id once, splits main and subagent, lists top reads and leaks no text", () => {
  const root = tmp();
  writeTranscripts(root);
  const l = buildLedger([root], { since: "2026-11-01" });
  assert.equal(l.messages, 3);
  assert.equal(l.byModel["claude-opus-5-5 | main"].turns, 2);
  assert.equal(l.byModel["claude-opus-5-5 | main"].output, 70);
  assert.equal(l.byModel["claude-sonnet-5-5 | subagent"].turns, 1);
  assert.equal(l.byModel["claude-opus-5-5 | main"].avgContext, 1110);
  assert.deepEqual(l.topReads[0], { file: "/r/docs/AC.md", count: 2 });
  assert.equal(l.agentSpawns["coder | sonnet"], 1);
  assert.equal(l.wallMinutes, 30);
  const printed = formatLedger(l) + JSON.stringify(issueLine(719, "s", l));
  assert.ok(!printed.includes(SECRET_TEXT) && !printed.includes(SECRET_CMD));
  assert.equal(issueLine(719, "s", l).turns, 3);
});

test("AC usage-ledger CLI appends one issue line", () => {
  const root = tmp();
  writeTranscripts(root);
  const led = tmp();
  const r = spawnSync("node", [path.join(repo, "scripts", "automation", "usage-ledger.mjs"), "--root", root, "--issue", "719", "--sessions", "s1", "--size", "s", "--ledger-dir", led], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes(SECRET_TEXT) && !r.stdout.includes(SECRET_CMD));
  const lines = fs.readFileSync(path.join(led, "issues.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).issue, 719);
});

test("AC every agent names the packet input and handback output, and no skill reads docs/AC.md whole", () => {
  const agentsDir = path.join(repo, ".claude", "agents");
  for (const f of fs.readdirSync(agentsDir).filter((x) => x.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(agentsDir, f), "utf8");
    assert.match(text, /input is a packet path/i, f);
    assert.match(text, /\.qm\/handbacks\//, f);
  }
  const skills = path.join(repo, ".claude", "skills");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".md") ? [path.join(d, e.name)] : []));
  for (const f of walk(skills)) {
    const text = fs.readFileSync(f, "utf8");
    const bad = text.split(/\r?\n/).filter((l) => /\b(?:read|open)\b[^.\n]*`docs\/AC\.md`/i.test(l) && !/\b(?:never|do not|not)\b/i.test(l));
    assert.deepEqual(bad, [], `${f} tells an agent to read docs/AC.md`);
  }
});
