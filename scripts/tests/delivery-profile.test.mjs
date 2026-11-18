// AC 7.17.1 to 7.17.5 (#762): the delivery profile, its check, evidence methods, lanes, packet commands and the skill text.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const profileText = fs.readFileSync(path.join(repo, ".claude", "delivery-profile.json"), "utf8");
const bundleSrc = fs.readFileSync(path.join(repo, "scripts", "bundle", "bundle.mjs"), "utf8");

// A copy of the parts of the repo the helper reads, so bad profiles can be tested without touching the real one.
function fixture(editProfile) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qm-762-"));
  for (const rel of ["scripts", ".claude/skills/qm-bundle-refine/templates", "docs/AC.md", "docs/openapi/quizymode-api.json", "Directory.Build.props", "src/Quizymode.Web/package.json", ".github/workflows"]) {
    fs.cpSync(path.join(repo, rel), path.join(root, rel), { recursive: true });
  }
  fs.mkdirSync(path.join(root, "src", "Quizymode.Web"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "Quizymode.Api", "Features"), { recursive: true });
  const profile = JSON.parse(profileText);
  editProfile?.(profile);
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "delivery-profile.json"), JSON.stringify(profile, null, 2));
  return root;
}
const helper = (root) => path.join(root, "scripts", "bundle", "bundle.mjs");

// A manifest with the given issues, built from the template the refine phase uses.
function manifestWith(root, issues) {
  const bundles = path.join(root, "bundles");
  const tpl = JSON.parse(fs.readFileSync(path.join(root, ".claude/skills/qm-bundle-refine/templates/manifest.template.json"), "utf8"));
  const id = "b-20261117-test-profile";
  const m = { ...tpl, bundleId: id, branches: { release: `release/${id}`, issuePrefix: `bundle/${id}/` }, issues };
  m.source = { ...m.source, commit: "a".repeat(40) };
  fs.mkdirSync(path.join(bundles, id), { recursive: true });
  fs.writeFileSync(path.join(bundles, id, "manifest.json"), JSON.stringify(m, null, 2));
  const sha = createHash("sha256").update(fs.readFileSync(path.join(bundles, id, "manifest.json"))).digest("hex");
  fs.writeFileSync(path.join(bundles, id, "approval.json"), JSON.stringify({ status: "approved", manifestSha256: sha }));
  return { bundles, id };
}
const issue = (number, paths, evidence = "unit") => ({
  number, title: `issue ${number}`, order: number, snapshot: { state: "OPEN", updatedAt: "2026-11-17T00:00:00Z", bodySha256: "a".repeat(64) },
  size: "s", risk: "low", ux: false, migration: false, dependsOn: [],
  scope: { summary: "test", paths, exclusions: [] },
  acceptanceCriteria: [{ id: "AC1", text: "observable", evidence }],
  validation: ["node --test scripts/tests/delivery-profile.test.mjs"],
});

test("AC 7.17.1 profile check exits 0 on this repo and names the field when a named path, workflow or check is missing", () => {
  const here = spawnSync("node", [path.join(repo, "scripts", "bundle", "bundle.mjs"), "profile", "check"], { encoding: "utf8", cwd: repo });
  assert.equal(here.status, 0, here.stdout + here.stderr);
  assert.equal(JSON.parse(here.stdout).ok, true);

  const badCheck = spawnSync("node", [helper(fixture((p) => { p.repo.requiredChecks[1].name = "no-such-job"; })), "profile", "check"], { encoding: "utf8" });
  assert.equal(badCheck.status, 2);
  assert.match(badCheck.stdout, /repo\.requiredChecks\[1\]/);

  const badAc = spawnSync("node", [helper(fixture((p) => { p.acFile = "docs/MISSING.md"; })), "profile", "check"], { encoding: "utf8" });
  assert.equal(badAc.status, 2);
  assert.match(badAc.stdout, /acFile/);

  const badWorkflow = spawnSync("node", [helper(fixture((p) => { p.releaseWorkflows.deploy = "missing.yml"; })), "profile", "check"], { encoding: "utf8" });
  assert.equal(badWorkflow.status, 2);
  assert.match(badWorkflow.stdout, /releaseWorkflows\.deploy/);
});

test("AC 7.17.2 check rejects an AC whose evidence is not a profile method or none", () => {
  const root = fixture();
  const { bundles, id } = manifestWith(root, [issue(20, ["scripts/validation/**"], "unit")]);
  const good = spawnSync("node", [helper(root), "check", id, "--bundles-dir", bundles], { encoding: "utf8" });
  assert.equal(good.status, 0, good.stdout + good.stderr);

  const other = fixture();
  const { bundles: b2, id: id2 } = manifestWith(other, [issue(20, ["scripts/validation/**"], "test")]);
  const bad = spawnSync("node", [helper(other), "check", id2, "--bundles-dir", b2], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /evidence 'test' is not a profile method or none/);
});

test("AC 7.17.3 lanes treats integratorOnly paths as non-overlapping, and bundle.mjs has no literal docs/AC.md or Quizymode", () => {
  assert.doesNotMatch(bundleSrc, /docs\/AC\.md/);
  assert.doesNotMatch(bundleSrc, /Quizymode/);

  const shared = [issue(1, ["docs/AC.md", "scripts/a/**"]), issue(2, ["docs/AC.md", "scripts/b/**"])];
  const root = fixture();
  const { bundles, id } = manifestWith(root, shared);
  const split = spawnSync("node", [helper(root), "lanes", id, "--bundles-dir", bundles], { encoding: "utf8" });
  assert.equal(split.status, 0, split.stdout);
  const lanes = JSON.parse(split.stdout);
  assert.ok(lanes.laneA.length === 1 && lanes.laneB.length === 1, `expected one issue per lane: ${split.stdout}`);

  const sameLane = fixture((p) => { p.integratorOnly = p.integratorOnly.filter((x) => x !== "docs/AC.md"); });
  const { bundles: b2, id: id2 } = manifestWith(sameLane, shared);
  const joined = spawnSync("node", [helper(sameLane), "lanes", id2, "--bundles-dir", b2], { encoding: "utf8" });
  const together = JSON.parse(joined.stdout);
  assert.ok(together.laneB.length === 0, `docs/AC.md overlap should keep both issues in one lane: ${joined.stdout}`);
});

test("AC 7.17.4 packet checks come from the profile and match the filtered commands", () => {
  const root = fixture();
  const { bundles, id } = manifestWith(root, [issue(20, ["src/Quizymode.Web/src/features/Example/**", "src/Quizymode.Api/Features/Study/**", "scripts/validation/**"])]);
  const packets = path.join(root, "packets");
  const r = spawnSync("node", [helper(root), "packet", id, "20", "--bundles-dir", bundles, "--packets-dir", packets, "--handbacks-dir", path.join(root, "hb"), "--ac-file", path.join(root, "docs", "AC.md"), "--no-git"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(packets, "20.md"), "utf8");
  assert.match(text, /npx vitest related --run src\/Quizymode\.Web\/src\/features\/Example/);
  assert.match(text, /eslint src\/Quizymode\.Web\/src\/features\/Example/);
  assert.match(text, /dotnet test --filter "\(FullyQualifiedName~Features\.Study\|FullyQualifiedName~Architecture\)&Category!=Postgres"/);
  assert.match(text, /node --test scripts\/tests\//);
  assert.match(text, /node scripts\/validation\/ac-gate\.mjs --issues 20/);
});

test("AC 7.17.5 no bundle skill file names C:\\Projects, Quizymode.Api, Quizymode.Web or Directory.Build.props, except an allowed-tools block", () => {
  const forbidden = [/C:[\\/]Projects/, /Quizymode\.Api/, /Quizymode\.Web/, /Directory\.Build\.props/];
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
          if (/^\s*-\s*(Bash|Read|Edit|Write|Glob|Grep)\(/.test(line)) return; // allowed-tools entries are literal by design
          if (forbidden.some((re) => re.test(line))) hits.push(`${path.relative(repo, p)}:${i + 1}`);
        });
      }
    }
  };
  for (const name of fs.readdirSync(path.join(repo, ".claude", "skills"))) {
    if (name.startsWith("qm-bundle-")) walk(path.join(repo, ".claude", "skills", name));
  }
  assert.deepEqual(hits, []);
});
