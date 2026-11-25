// Tests for #719: ac-slice.mjs, bundle.mjs packet/handback-check, usage-ledger.mjs and the agent/skill wiring.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sliceAc, render } from "../validation/ac-slice.mjs";
import { buildLedger, formatLedger, issueLine } from "../automation/usage-ledger.mjs";

// Temp folders this file makes are removed when the file ends, so %TEMP% does not collect qm-* folders (#761).
const madeDirs = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); madeDirs.push(d); return d; };
after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = path.join(repo, "scripts", "bundle", "bundle.mjs");
const tmp = () => mkTmp("qm-719-");
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
  assert.match(text, /- coder: sonnet\. Why:/);
  assert.match(text, /- architect: sonnet\. Why:/);
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

test("AC packet models: haiku by default, sonnet and opus only on a scored criterion (AC 7.13.3)", () => {
  const roles = (bundleOpts, extra = []) => {
    const dir = tmp();
    const { r, file } = packet(dir, 20, extra, bundleOpts);
    assert.equal(r.status, 0, r.stdout);
    return Object.fromEntries([...fs.readFileSync(file, "utf8").matchAll(/^- (\S+): (\w+)\. Why:/gm)].map((m) => [m[1], m[2]]));
  };
  // The manifest carries no ambiguity, novelty or reasoning, so they are unknown and assessed by sonnet.
  assert.deepEqual(roles({ size: "s" }), { architect: "sonnet", reviewer: "sonnet", "qm-lead": "opus", coder: "sonnet", tester: "sonnet", "ux-designer": "sonnet", reporter: "haiku" });
  assert.equal(roles({ size: "s", risk: "high" }).architect, "opus");
  assert.equal(roles({ size: "s", risk: "high" }).coder, "sonnet");
  assert.equal(roles({ size: "s", migration: true }).coder, "opus");
  assert.equal(roles({ size: "s" }, ["--failure", "reasoning", "--prior-model", "sonnet"]).coder, "opus");
  assert.equal(roles({ size: "s" }, ["--failure", "reasoning", "--prior-model", "haiku"]).coder, "sonnet");
  assert.equal(roles({ size: "s" }, ["--failure", "reasoning"]).coder, "sonnet");
  assert.equal(roles({ size: "s" }, ["--failure", "environment"]).coder, "sonnet");
  assert.equal(roles({ size: "s" }, ["--attempt", "2"]).coder, "sonnet");
  assert.equal(roles({ size: "l" }).coder, "sonnet");
  assert.equal(roles({ size: "s", risk: "high" }).reporter, "haiku");
  const bad = packet(tmp(), 20, ["--failure", "bogus"], { size: "s" });
  assert.equal(bad.r.status, 1);
});

test("AC manifest size must be xs, s, m or l, and --attempt cannot be below one", () => {
  const bad = packet(tmp(), 20, [], { size: "huge" });
  assert.equal(bad.r.status, 2);
  assert.match(bad.r.stdout, /size must be xs, s, m or l/);
  assert.equal(packet(tmp(), 20, ["--attempt", "0"], { size: "s" }).r.status, 1);
});

test("AC packet --from-issue builds a packet from the draft ACs and labels", () => {
  const dir = tmp();
  const json = path.join(dir, "issue.json");
  fs.writeFileSync(json, JSON.stringify({ title: "Thing", labels: [{ name: "size:m" }], body: "## Draft ACs\n- AC (draft) [verify: unit] It works.\nOut of scope: hooks\n" }));
  const r = run(["packet", "--from-issue", "5", "--issue-json", json, "--packets-dir", path.join(dir, "p"), "--handbacks-dir", path.join(dir, "h"), "--ac-file", path.join(dir, "none.md")]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(dir, "p", "5.md"), "utf8");
  assert.match(text, /- coder: sonnet/);
  assert.match(text, /risk unknown/);
  assert.match(text, /It works\./);
  assert.match(text, /hooks/);
});

// AC 7.13.2 (checkbox ACs and body risk): from-issue reads normal checkbox ACs and an explicit Risk line, and never reads missing risk as low.
test("AC 7.13.2 packet --from-issue reads checkbox ACs, an explicit body risk, and keeps missing risk unknown", () => {
  const dir = tmp();
  const from = (body, labels = []) => {
    const json = path.join(dir, `issue-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(json, JSON.stringify({ title: "Copy", labels: labels.map((name) => ({ name })), body }));
    const packets = path.join(dir, "p");
    const r = run(["packet", "--from-issue", "5", "--issue-json", json, "--packets-dir", packets, "--handbacks-dir", path.join(dir, "h"), "--ac-file", path.join(dir, "none.md")]);
    return { r, text: r.status === 0 ? fs.readFileSync(path.join(packets, "5.md"), "utf8") : "" };
  };
  const checkboxes = "## Acceptance\n- [ ] Shows the Why label on exams items [verify: unit]\n- [x] Hides the count [verify: unit]\n- A note without a marker\n";
  const cb = from(checkboxes, ["size:s"]);
  assert.equal(cb.r.status, 0, cb.r.stdout);
  assert.match(cb.text, /Shows the Why label on exams items/);
  assert.match(cb.text, /Hides the count/);
  assert.doesNotMatch(cb.text, /A note without a marker/);
  // Explicit "Risk Low" and "Migration: none" in the body are captured, and route coder and tester to haiku at size s (risk low, no migration, attempt 1).
  const low = from(`${checkboxes}Impact 3 · Effort 1 (size S) · Risk Low · Confidence High.\nMigration: none\n`, ["size:s"]);
  assert.match(low.text, /risk low \(issue body\)/);
  assert.match(low.text, /migration false/);
  assert.match(low.text, /- coder: sonnet\. Why:/);
  assert.match(low.text, /- tester: sonnet. Why:/);
  // Low risk alone is not enough: a migration nobody stated stays unknown, and unknown escalates coder and tester.
  const lowNoMigration = from(`${checkboxes}Risk Low\n`, ["size:s"]);
  assert.match(lowNoMigration.text, /migration unknown/);
  assert.match(lowNoMigration.text, /- coder: sonnet/);
  // No label and no body risk: unknown, which moves coder and tester to sonnet. Unknown is never read as low.
  const unknown = from(checkboxes, ["size:s"]);
  assert.match(unknown.text, /risk unknown \(unknown\)/);
  assert.match(unknown.text, /- coder: sonnet/);
  // A risk label beats a body statement.
  const labelWins = from(`${checkboxes}Risk Low\n`, ["size:s", "risk:high"]);
  assert.match(labelWins.text, /risk high \(risk label\)/);
  // A body that says only "risk" with no level stays unknown.
  assert.match(from("- [ ] Thing [verify: unit]\nRisk: to be decided\n", ["size:s"]).text, /risk unknown/);
  // No marker at all is still refused.
  assert.equal(from("- [ ] no marker here\n").r.status, 2);
});

// AC 7.13.3: every dispatch record names the role, the model it ran on, and the reason, copied from the packet.
test("AC 7.13.3 handback-save records the dispatch model and reason from the packet", () => {
  const dir = tmp();
  const { r, file } = packet(dir, 20, [], { size: "s" });
  assert.equal(r.status, 0, r.stdout);
  fs.writeFileSync(path.join(dir, "plan.md"), "plan\n");
  const f = path.join(dir, "h.json");
  const hb = path.join(dir, "hb-out");
  fs.writeFileSync(f, JSON.stringify({ status: "done", filesChanged: [], commands: [], acEvidence: { AC1: "plan.md" }, questions: [] }));
  const saved = spawnSync("node", [BUNDLE, "handback-save", "test-bundle", "--issue", "20", "--role", "coder", "--file", f, "--handbacks-dir", hb, "--repo-root", dir, "--packets-dir", path.dirname(file)], { encoding: "utf8" });
  assert.equal(saved.status, 0, saved.stdout);
  const claim = JSON.parse(fs.readFileSync(path.join(hb, "20-coder.json"), "utf8"));
  assert.equal(claim.dispatch.role, "coder");
  assert.equal(claim.dispatch.model, "sonnet");
  assert.match(claim.dispatch.reason, /ambiguity unknown/);
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

test("AC handback-check rejects a done handback with a failing command; handback-save records a claim and checks evidence paths", () => {
  const dir = tmp();
  const f = path.join(dir, "h.json");
  const hb = path.join(dir, "hb");
  const base = { status: "done", filesChanged: [], commands: [{ command: "node --test", exitCode: 1 }], acEvidence: { AC1: "scripts/tests/work-packets.test.mjs" }, questions: [] };
  fs.writeFileSync(f, JSON.stringify(base));
  const failing = run(["handback-check", f]);
  assert.equal(failing.status, 2);
  assert.match(failing.stdout, /nonzero exitCode/);
  const save = (h, role = "tester") => {
    fs.writeFileSync(f, JSON.stringify(h));
    return spawnSync("node", [BUNDLE, "handback-save", "test-bundle", "--issue", "20", "--role", role, "--file", f, "--handbacks-dir", hb, "--repo-root", repo], { encoding: "utf8" });
  };
  const good = { ...base, commands: [{ command: "node --test", exitCode: 0 }] };
  const saved = save(good);
  assert.equal(saved.status, 0, saved.stdout);
  const rec = JSON.parse(fs.readFileSync(path.join(hb, "20-tester.json"), "utf8"));
  assert.equal(rec.claimed, true);
  assert.equal(rec.role, "tester");
  const missing = save({ ...good, acEvidence: { AC1: "no/such/file.txt" } });
  assert.equal(missing.status, 2);
  assert.match(missing.stdout, /missing file/);
  assert.equal(save(good, "wizard").status, 1);
});

test("AC 7.13.4 planning roles may finish done with empty acEvidence only under strict rules, and a dirty shared tree does not block them", () => {
  const dir = tmp();
  const repoDir = path.join(dir, "repo");
  fs.mkdirSync(repoDir);
  const git = (...args) => execFileSync("git", ["-C", repoDir, "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { encoding: "utf8" });
  git("init", "-q");
  fs.writeFileSync(path.join(repoDir, "tracked.txt"), "v1\n");
  git("add", "tracked.txt");
  git("commit", "-q", "-m", "init");
  fs.writeFileSync(path.join(repoDir, "plan.md"), "plan\n"); // untracked deliverable, as .qm files are
  const plan = { status: "done", filesChanged: [], commands: [], acEvidence: {}, questions: [], deliverable: "plan.md" };
  const f = path.join(dir, "h.json");
  const hb = path.join(dir, "hb");
  const check = (h, role) => {
    fs.writeFileSync(f, JSON.stringify(h));
    return run(role ? ["handback-check", f, "--role", role] : ["handback-check", f]);
  };
  const save = (h, role) => {
    fs.writeFileSync(f, JSON.stringify(h));
    return spawnSync("node", [BUNDLE, "handback-save", "test-bundle", "--issue", "21", "--role", role, "--file", f, "--handbacks-dir", hb, "--repo-root", repoDir], { encoding: "utf8" });
  };
  // Positive: a read-only role with no files changed, a deliverable and no failing command.
  for (const role of ["architect", "reviewer", "ux-designer", "qm-lead"]) assert.equal(check(plan, role).status, 0, role);
  // Negative: no role given keeps the strict rule.
  const strict = check(plan);
  assert.equal(strict.status, 2);
  assert.match(strict.stdout, /acEvidence must name at least one AC/);
  // Negative: filesChanged, a missing deliverable, a failing command, a non-string deliverable, or an implementation role.
  assert.equal(check({ ...plan, filesChanged: ["a.mjs"] }, "architect").status, 2);
  assert.equal(check({ ...plan, deliverable: undefined }, "architect").status, 2);
  assert.equal(check({ ...plan, commands: [{ command: "node --test", exitCode: 1 }] }, "architect").status, 2);
  assert.equal(check({ ...plan, deliverable: 7 }, "architect").status, 2);
  assert.equal(check(plan, "tester").status, 2);
  assert.equal(check(plan, "coder").status, 2);
  // handback-save: a clean tracked tree and an existing deliverable are saved as a claim.
  const saved = save(plan, "architect");
  assert.equal(saved.status, 0, saved.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(hb, "21-architect.json"), "utf8")).claimed, true);
  // Role spoofing: an implementation role cannot use the planning rule to skip evidence.
  assert.equal(save(plan, "coder").status, 2);
  assert.match(save({ ...plan, deliverable: "missing.md" }, "architect").stdout, /planning deliverable is missing/);
  // Regression: the shared worktree is dirty because the coder changed a tracked file after the architect ran.
  // The architect's claim is still valid, so it is saved; the tree state does not say which agent wrote the change.
  fs.writeFileSync(path.join(repoDir, "tracked.txt"), "v2\n");
  const afterCoder = save(plan, "architect");
  assert.equal(afterCoder.status, 0, afterCoder.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(hb, "21-architect.json"), "utf8")).claimed, true);
  // The coder and tester still need evidence, even with a dirty tree.
  assert.equal(save(plan, "tester").status, 2);
  assert.equal(save({ ...plan, commands: [{ command: "node --test", exitCode: 1 }] }, "architect").status, 2);
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

// AC 7.13.5 (window): --until bounds a batch at both ends, so one batch is measured on its own.
test("AC 7.13.5 usage-ledger --until measures one batch window, not the cumulative one", () => {
  const root = tmp();
  writeTranscripts(root);
  // Fixture: main messages at 10:00 and 10:30 (opus), one subagent message at 10:10 (sonnet). Window 10:05 to 10:20 holds only the subagent.
  const l = buildLedger([root], { since: "2026-11-10T10:05:00Z", until: "2026-11-10T10:20:00Z" });
  assert.equal(l.messages, 1);
  assert.equal(l.byModel["claude-sonnet-5-5 | subagent"].turns, 1);
  assert.equal(l.byModel["claude-opus-5-5 | main"], undefined);
  const cli = spawnSync("node", [path.join(repo, "scripts", "automation", "usage-ledger.mjs"), "--root", root, "--since", "2026-11-10T10:05:00Z", "--until", "2026-11-10T10:20:00Z"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Window: 2026-11-10T10:05:00Z to 2026-11-10T10:20:00Z/);
  const bad = spawnSync("node", [path.join(repo, "scripts", "automation", "usage-ledger.mjs"), "--root", root, "--since", "not-a-date"], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--since is not a date/);
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

test("AC usage-ledger refuses a session already counted for another issue and reports orchestration overhead", () => {
  const root = tmp();
  writeTranscripts(root);
  const led = tmp();
  const cli = (args) => spawnSync("node", [path.join(repo, "scripts", "automation", "usage-ledger.mjs"), "--root", root, "--ledger-dir", led, ...args], { encoding: "utf8" });
  assert.equal(cli(["--issue", "719", "--sessions", "s1", "--size", "s"]).status, 0);
  const again = cli(["--issue", "720", "--sessions", "s1"]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /already count toward issue #719/);
  assert.equal(cli(["--issue", "721", "--sessions", "nope"]).status, 2);
  const since = cli(["--since", "2026-11-01"]);
  assert.match(since.stdout, /Orchestration overhead \(sessions on no issue line\): 0 session/);
  assert.match(since.stdout, /not subscription cost or billed amounts/);
});

test("AC packet check selection follows the scope paths: an API feature gets its filtered dotnet test, scripts get node --test", () => {
  const dir = tmp();
  const id = writeBundle(path.join(dir, "bundles"), { size: "s" });
  const mf = path.join(dir, "bundles", id, "manifest.json");
  const m = JSON.parse(fs.readFileSync(mf, "utf8"));
  m.issues[0].scope.paths = ["src/Quizymode.Api/Features/Study/**", "scripts/validation/**"];
  fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  const sha = createHash("sha256").update(fs.readFileSync(mf)).digest("hex");
  fs.writeFileSync(path.join(dir, "bundles", id, "approval.json"), JSON.stringify({ status: "approved", manifestSha256: sha }));
  const acFile = path.join(dir, "AC.md");
  fs.writeFileSync(acFile, AC_FIXTURE);
  const r = run(["packet", id, "20", "--bundles-dir", path.join(dir, "bundles"), "--packets-dir", path.join(dir, "packets"), "--handbacks-dir", path.join(dir, "hb"), "--ac-file", acFile, "--no-git"]);
  assert.equal(r.status, 0, r.stdout);
  const text = fs.readFileSync(path.join(dir, "packets", "20.md"), "utf8");
  assert.match(text, /dotnet test --filter "\(FullyQualifiedName~Features\.Study\|FullyQualifiedName~Architecture\)&Category!=Postgres"/);
  assert.doesNotMatch(text, /vitest related/);
  assert.match(text, /node --test scripts\/tests\//);
});

test("AC every agent names the packet input and handback output, and no skill reads docs/AC.md whole", () => {
  const agentsDir = path.join(repo, ".claude", "agents");
  for (const f of fs.readdirSync(agentsDir).filter((x) => x.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(agentsDir, f), "utf8");
    assert.match(text, /input is a packet path/i, f);
    assert.match(text, /handback-save/, f);
  }
  const skills = path.join(repo, ".claude", "skills");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".md") ? [path.join(d, e.name)] : []));
  for (const f of walk(skills)) {
    const text = fs.readFileSync(f, "utf8");
    const bad = text.split(/\r?\n/).filter((l) => /\b(?:read|open)\b[^.\n]*`docs\/AC\.md`/i.test(l) && !/\b(?:never|do not|not)\b/i.test(l));
    assert.deepEqual(bad, [], `${f} tells an agent to read docs/AC.md`);
  }
});

// ---------- #740: related ACs, invariants, common API conventions ----------
const REL_AC = `# AC
## Common API conventions
- Conventions line: every list endpoint pages.
## Global invariants
### Collections
- **Invariant C5 – Collection write access (#289)**
  - Owner only, admins are non-owners.
  - Second sub-line.
- **Invariant V1 – Private collection access**
  - Private means owner only.
## 1. Collections
### AC 1.6 Sharing (#20)
- **AC 1.6.1** [Dev] [verify: api] Owner shares (#20).
- **AC 1.6.2** [Dev] [verify: api] Owner unshares.
## 2. Heading with no ACs
## 3. Elsewhere
- **AC 3.1.1** [Dev] [verify: unit] Misplaced but related.
`;

function relPacket(dir, { paths, relatedAcs, number = 20 } = {}) {
  const id = writeBundle(path.join(dir, "bundles"), { size: "s" });
  const mf = path.join(dir, "bundles", id, "manifest.json");
  const m = JSON.parse(fs.readFileSync(mf, "utf8"));
  if (paths) m.issues[0].scope.paths = paths;
  if (relatedAcs) m.issues[0].relatedAcs = relatedAcs;
  m.issues[0].number = number;
  fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  const sha = createHash("sha256").update(fs.readFileSync(mf)).digest("hex");
  fs.writeFileSync(path.join(dir, "bundles", id, "approval.json"), JSON.stringify({ status: "approved", manifestSha256: sha }));
  const acFile = path.join(dir, "AC.md");
  fs.writeFileSync(acFile, REL_AC);
  const common = ["--bundles-dir", path.join(dir, "bundles"), "--packets-dir", path.join(dir, "packets"), "--handbacks-dir", path.join(dir, "hb"), "--ac-file", acFile, "--no-git"];
  return {
    id, acFile, common,
    check: () => run(["check", id, ...common]),
    packet: () => run(["packet", id, String(number), ...common]),
    text: () => fs.readFileSync(path.join(dir, "packets", `${number}.md`), "utf8"),
  };
}

test("AC 7.13.9 ac-slice --invariant prints one invariant with its sub-lines, an unknown id is No match, the index has no bodies", () => {
  const out = sliceAc(REL_AC, { invariant: "C5" });
  assert.equal(out.length, 3);
  assert.match(out[0], /Invariant C5 – Collection write access/);
  assert.match(out[2], /Second sub-line/);
  assert.deepEqual(sliceAc(REL_AC, { invariant: "ZZ9" }), []);
  const index = sliceAc(REL_AC, { "invariants-index": true });
  assert.deepEqual(index, ["C5 – Collection write access (#289)", "V1 – Private collection access"]);
  const cli = (...a) => spawnSync("node", [path.join(repo, "scripts", "validation", "ac-slice.mjs"), ...a], { encoding: "utf8" });
  const dir = tmp();
  const file = path.join(dir, "AC.md");
  fs.writeFileSync(file, REL_AC);
  const none = cli("--invariant", "ZZ9", "--file", file);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /No match/);
  assert.doesNotMatch(cli("--invariants-index", "--file", file).stdout, /owner only/i);
  assert.match(cli("--invariant", "V1").stdout, /Invariant V1/);
});

test("AC 7.13.10 bundle check rejects an unresolved relatedAcs entry naming issue and entry, and passes without relatedAcs", () => {
  assert.equal(relPacket(tmp(), {}).check().status, 0);
  const good = relPacket(tmp(), { relatedAcs: { ids: ["1.6"], invariants: ["C5"], headings: ["Common API conventions"] } });
  assert.equal(good.check().status, 0, good.check().stdout);
  for (const [bad, entry] of [[{ ids: ["9.9"] }, "9.9"], [{ invariants: ["Z9"] }, "Z9"], [{ headings: ["No such heading"] }, "No such heading"]]) {
    const r = relPacket(tmp(), { relatedAcs: bad }).check();
    assert.equal(r.status, 2);
    assert.match(r.stdout, /issue #20/);
    assert.ok(r.stdout.includes(entry), r.stdout);
  }
});

test("AC 7.13.11 packet Related ACs lists the issue slice, then id slices, then invariants, without duplicates, and fails on a vanished reference", () => {
  const t = relPacket(tmp(), { relatedAcs: { ids: ["1.6", "3.1.1"], invariants: ["V1", "C5", "V1"], headings: [] } });
  assert.equal(t.packet().status, 0);
  const text = t.text();
  const at = (s) => text.indexOf(s);
  assert.ok(at("Owner shares") > 0 && at("Owner shares") < at("Owner unshares"));
  assert.ok(at("Owner unshares") < at("Misplaced but related"));
  assert.ok(at("Misplaced but related") < at("Private means owner only"));
  assert.ok(at("Private means owner only") < at("Owner only, admins are non-owners"));
  assert.equal(text.split("Owner shares (#20)").length - 1, 1);
  assert.equal(text.split("Private means owner only").length - 1, 1);
  const gone = relPacket(tmp(), { relatedAcs: { ids: ["1.6"] } });
  fs.writeFileSync(gone.acFile, REL_AC.replace("**AC 1.6.1**", "**AC 1.7.1**").replace("**AC 1.6.2**", "**AC 1.7.2**"));
  const r = gone.packet();
  assert.equal(r.status, 2);
  assert.match(r.stdout, /id '1\.6'/);
});

test("AC 7.13.12 every packet has the invariant index; API scope adds Common API conventions, web and scripts scope does not", () => {
  const api = relPacket(tmp(), { paths: ["src/Quizymode.Api/Features/Study/**", "scripts/validation/**"] });
  assert.equal(api.packet().status, 0);
  assert.match(api.text(), /C5 – Collection write access \(#289\)/);
  assert.match(api.text(), /Common API conventions/);
  assert.match(api.text(), /every list endpoint pages/);
  const web = relPacket(tmp(), { paths: ["src/Quizymode.Web/src/**", "scripts/validation/**"] });
  assert.equal(web.packet().status, 0);
  assert.match(web.text(), /V1 – Private collection access/);
  assert.doesNotMatch(web.text(), /Common API conventions|every list endpoint pages/);
});

test("AC 7.13.13 packet --from-issue reads a Related ACs line, and says not refined without it", () => {
  const dir = tmp();
  const acFile = path.join(dir, "AC.md");
  fs.writeFileSync(acFile, REL_AC);
  const from = (body) => {
    const json = path.join(dir, "issue.json");
    fs.writeFileSync(json, JSON.stringify({ title: "T", body, labels: [] }));
    const r = run(["packet", "--from-issue", "5", "--issue-json", json, "--packets-dir", path.join(dir, "p"), "--handbacks-dir", path.join(dir, "h"), "--ac-file", acFile]);
    return { r, text: r.status === 0 ? fs.readFileSync(path.join(dir, "p", "5.md"), "utf8") : "" };
  };
  const withLine = from("- AC (draft) [verify: unit] Does a thing\nRelated ACs: 1.6, C5\n");
  assert.equal(withLine.r.status, 0, withLine.r.stdout);
  assert.match(withLine.text, /Owner shares/);
  assert.match(withLine.text, /Invariant C5/);
  assert.doesNotMatch(withLine.text, /not refined/);
  const without = from("- AC (draft) [verify: unit] Does a thing\n");
  assert.equal(without.r.status, 0);
  assert.match(without.text, /related ACs: not refined/);
  assert.equal(from("- AC (draft) [verify: unit] x\nRelated ACs: 9.9\n").r.status, 2);
});

test("AC 7.13.14 architect.md names acRefsAdded, handback-check validates its type, and the refine skill mentions relatedAcs in steps 3 and 8", () => {
  const architect = fs.readFileSync(path.join(repo, ".claude", "agents", "architect.md"), "utf8");
  assert.match(architect, /acRefsAdded/);
  assert.match(architect, /input is a packet path/i);
  const dir = tmp();
  const hb = (extra) => {
    const f = path.join(dir, "hb.json");
    fs.writeFileSync(f, JSON.stringify({ status: "done", filesChanged: [], commands: [], acEvidence: { "7.1": "x" }, questions: [], ...extra }));
    return run(["handback-check", f]);
  };
  assert.equal(hb({}).status, 0);
  assert.equal(hb({ acRefsAdded: ["7.1", "C5"] }).status, 0);
  for (const bad of ["C5", [1], { a: 1 }]) {
    const r = hb({ acRefsAdded: bad });
    assert.equal(r.status, 2);
    assert.match(r.stdout, /acRefsAdded/);
  }
  const skill = fs.readFileSync(path.join(repo, ".claude", "skills", "qm-bundle-refine", "SKILL.md"), "utf8").split(/\r?\n/);
  assert.match(skill.find((l) => /^3\. /.test(l)), /relatedAcs/);
  assert.match(skill.find((l) => /^8\. /.test(l)), /relatedAcs/);
  assert.ok(skill.some((l) => l.includes("ac-slice.mjs *")));
});

test("AC 7.13.11 fixture: an invariant carrying an issue number but no AC line stays out of --issue and is included by relatedAcs", () => {
  assert.equal(sliceAc(REL_AC, { issue: "289" }).length, 0);
  const t = relPacket(tmp(), { number: 289, relatedAcs: { invariants: ["C5"] } });
  assert.equal(t.packet().status, 0, t.packet().stdout);
  assert.match(t.text(), /Invariant C5 – Collection write access/);
});

test("AC 7.13.11 fixture: a heading followed by a misplaced AC, the id reference finds what the heading reference cannot", () => {
  assert.equal(sliceAc(REL_AC, { heading: "Heading with no ACs" }).some((l) => l.includes("Misplaced but related")), false);
  assert.equal(sliceAc(REL_AC, { id: "3.1.1" }).some((l) => l.includes("Misplaced but related")), true);
  const t = relPacket(tmp(), { relatedAcs: { ids: ["3.1.1"], headings: ["Heading with no ACs"] } });
  assert.equal(t.packet().status, 0);
  assert.match(t.text(), /Misplaced but related/);
  assert.match(t.text(), /Related headings .*Heading with no ACs/);
});
