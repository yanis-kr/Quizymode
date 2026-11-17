// AC 7.13.3: the shared model routing policy, its direct-invocation baselines, and the Claude adapter's dispatch behaviour.
// Mocks only: no test calls a real model or the claude CLI.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { routeModel, baselineModel, chooseAvailable, classifyIssue, ROLES } from "../automation/model-policy.mjs";
import { runSpecialist, resolveModel, MODEL_ASSIGNMENTS, AdapterError } from "../automation/claude-adapter.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIMPLE = { size: "xs", risk: "low", migration: false, ambiguity: "low", novelty: "low", reasoning: "low", failure: "none" };
const MEDIUM = { size: "m", risk: "medium", migration: false, ambiguity: "low", novelty: "low", reasoning: "medium", failure: "none" };
const MEDIUM_HIGH = { size: "m", risk: "medium", migration: false, ambiguity: "low", novelty: "low", reasoning: "high", failure: "none" };
const HIGH = { size: "l", risk: "high", migration: true, ambiguity: "high", novelty: "high", reasoning: "high", failure: "none" };
const SECURITY = { size: "m", risk: "high", migration: false, ambiguity: "low", novelty: "low", reasoning: "low", failure: "none" };

const model = (role, facts) => routeModel(role, facts).model;

describe("routing matrix (AC 7.13.3)", () => {
  test("simple, well-defined work runs on haiku in every implementing and reviewing role", () => {
    for (const role of ["architect", "reviewer", "coder", "tester", "ux-designer", "reporter"]) {
      assert.equal(model(role, SIMPLE), "haiku", role);
    }
  });

  test("the decision-maker is never below sonnet", () => {
    assert.equal(model("qm-decision-maker", SIMPLE), "sonnet");
  });

  test("medium complexity escalates to sonnet, and the reporter stays haiku", () => {
    for (const role of ["architect", "reviewer", "coder", "tester", "ux-designer"]) {
      assert.equal(model(role, MEDIUM), "sonnet", role);
    }
    assert.equal(model("reporter", MEDIUM), "haiku");
  });

  test("medium-risk work with high reasoning complexity can warrant opus, without high risk", () => {
    assert.equal(model("architect", MEDIUM_HIGH), "opus");
    assert.equal(model("reviewer", MEDIUM_HIGH), "opus");
    assert.equal(model("coder", MEDIUM_HIGH), "opus");
  });

  test("tester and ux-designer are capped at sonnet", () => {
    assert.equal(model("tester", HIGH), "sonnet");
    assert.equal(model("ux-designer", HIGH), "sonnet");
  });

  test("high complexity: architect and reviewer on opus; the coder on opus for a migration", () => {
    assert.equal(model("architect", HIGH), "opus");
    assert.equal(model("reviewer", HIGH), "opus");
    assert.equal(model("coder", HIGH), "opus");
  });

  test("a high-impact security feature: opus architect and reviewer, implementation chosen separately", () => {
    assert.equal(model("architect", SECURITY), "opus");
    assert.equal(model("reviewer", SECURITY), "opus");
    assert.equal(model("coder", SECURITY), "sonnet");
    assert.equal(model("tester", SECURITY), "sonnet");
  });

  test("scope alone never reaches opus: a large but straightforward change stays on sonnet", () => {
    const bigButEasy = { size: "l", risk: "low", migration: false, ambiguity: "low", novelty: "low", reasoning: "low", failure: "none" };
    assert.equal(model("architect", bigButEasy), "sonnet");
    assert.equal(model("coder", bigButEasy), "sonnet");
  });

  test("unknown complexity is assessed by sonnet, not opus", () => {
    for (const role of ["architect", "reviewer", "coder", "tester"]) {
      assert.equal(model(role, {}), "sonnet", role);
    }
  });

  test("a missing migration on a frontend-only change does not escalate a coder to opus", () => {
    assert.notEqual(model("coder", { ...SIMPLE, migration: "unknown" }), "opus");
  });

  test("an environment failure is fixed, not escalated, whatever model made the attempt", () => {
    for (const priorModel of ["haiku", "sonnet", "opus", undefined]) {
      assert.equal(model("coder", { ...SIMPLE, failure: "environment", priorModel }), "haiku", String(priorModel));
    }
  });

  test("a reasoning failure escalates one step from the model that failed: haiku to sonnet, sonnet to opus", () => {
    assert.equal(model("coder", { ...SIMPLE, failure: "reasoning", priorModel: "haiku" }), "sonnet");
    assert.equal(model("coder", { ...SIMPLE, failure: "reasoning", priorModel: "sonnet" }), "opus");
    assert.equal(model("architect", { ...SIMPLE, failure: "reasoning", priorModel: "haiku" }), "sonnet");
    assert.equal(model("architect", { ...SIMPLE, failure: "reasoning", priorModel: "sonnet" }), "opus");
  });

  test("a haiku reasoning failure never jumps straight to opus", () => {
    assert.notEqual(model("coder", { ...SIMPLE, failure: "reasoning", priorModel: "haiku" }), "opus");
    assert.notEqual(model("reviewer", { ...SIMPLE, failure: "reasoning", priorModel: "haiku" }), "opus");
  });

  test("an unknown prior model with a reasoning failure goes to sonnet, not opus", () => {
    assert.equal(model("coder", { ...SIMPLE, failure: "reasoning" }), "sonnet");
  });

  test("tester and ux-designer stay capped at sonnet even after a sonnet reasoning failure", () => {
    assert.equal(model("tester", { ...SIMPLE, failure: "reasoning", priorModel: "sonnet" }), "sonnet");
    assert.equal(model("ux-designer", { ...SIMPLE, failure: "reasoning", priorModel: "sonnet" }), "sonnet");
  });

  test("a high-complexity task may start on opus directly, with no failure history", () => {
    assert.equal(model("coder", { ...SIMPLE, reasoning: "high" }), "opus");
  });

  test("every routing decision carries a reason that names what raised it", () => {
    assert.match(routeModel("architect", HIGH).reason, /risk high/);
    assert.match(routeModel("coder", SIMPLE).reason, /every dimension low/);
  });

  test("unknown roles are refused", () => {
    assert.throws(() => routeModel("project-manager", SIMPLE));
  });
});

describe("issue classification without extra labels (AC 7.13.3)", () => {
  const LINES = "- [ ] The quiz screen never shows the helper sentence. [verify: unit]\n- [ ] The breadcrumb uses display names. [verify: unit]\n";
  const simpleIssue = { title: "fix(study): remove copy", body: `Part of #710.\n## Draft acceptance criteria\n${LINES}Impact 3 · Effort 1 · Risk Low`, labels: ["area:ux", "area:study"], size: "s", acCount: 2 };
  const routed = (c) => Object.fromEntries(ROLES.map((r) => [r, routeModel(r, c.facts).model]));

  test("a clearly simple, frontend-only, low-risk issue is classified low with no extra labels, and routes to haiku", () => {
    const c = classifyIssue(simpleIssue);
    assert.equal(c.simple, true, c.reason);
    assert.deepEqual(c.facts, { size: "s", risk: "low", migration: false, ambiguity: "low", novelty: "low", reasoning: "low" });
    assert.equal(routed(c).coder, "haiku");
    assert.equal(routed(c).tester, "haiku");
    assert.equal(routed(c).architect, "haiku");
  });

  test("the same issue with a sensitive word is not classified simple, so nothing is inferred low", () => {
    const c = classifyIssue({ ...simpleIssue, body: `${simpleIssue.body}\nThe API response changes.` });
    assert.equal(c.simple, false);
    assert.match(c.reason, /sensitive word "api"/);
    assert.equal(c.facts.ambiguity, "unknown");
    assert.equal(routed(c).coder, "sonnet");
  });

  test("a medium size is not simple, so routing stays on sonnet", () => {
    const c = classifyIssue({ ...simpleIssue, size: "m" });
    assert.equal(c.simple, false);
    assert.equal(routed(c).coder, "sonnet");
  });

  test("too many acceptance criteria is not simple", () => {
    assert.equal(classifyIssue({ ...simpleIssue, acCount: 7 }).simple, false);
  });

  test("an issue with no acceptance criteria is unclear, not simple", () => {
    assert.equal(classifyIssue({ ...simpleIssue, acCount: 0 }).simple, false);
  });

  test("a value stated in the body wins over the inference", () => {
    const c = classifyIssue({ ...simpleIssue, body: `${simpleIssue.body}\nReasoning: high` });
    assert.equal(c.facts.reasoning, "high");
    assert.equal(c.simple, false);
    assert.equal(routed(c).coder, "opus");
  });

  test("a stated medium risk keeps the issue out of the simple class", () => {
    const c = classifyIssue({ ...simpleIssue, body: simpleIssue.body.replace("Risk Low", "Risk: medium") });
    assert.equal(c.facts.risk, "medium");
    assert.equal(c.simple, false);
  });

  test("a db label means a migration and keeps the issue out of the simple class", () => {
    const c = classifyIssue({ ...simpleIssue, labels: ["area:db"] });
    assert.equal(c.facts.migration, true);
    assert.equal(c.simple, false);
    assert.equal(routed(c).coder, "opus");
  });

  test("a frontend-only issue with no migration statement is classified as no migration", () => {
    assert.equal(classifyIssue(simpleIssue).facts.migration, false);
  });
});

// Packet to adapter. The packet's model lines are the input the orchestrator dispatches with: each role runs through
// runSpecialist with that model, and the mocked CLI records the model it actually received. No real agent is spawned.
describe("packet to adapter dispatch (AC 7.13.3)", () => {
  const bundle = path.join(repo, "scripts", "bundle", "bundle.mjs");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qm-model-policy-"));
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const AC = "- [ ] The quiz screen shows the explanation. [verify: unit]\n- [ ] The label reads Why. [verify: unit]\n";

  // Runs bundle.mjs packet on a fixture issue and returns the models it wrote.
  const packetModels = (name, labels, body, extra = []) => {
    const issueFile = path.join(tmp, `${name}.json`);
    fs.writeFileSync(issueFile, JSON.stringify({ title: name, body, labels: labels.map((n) => ({ name: n })) }));
    const out = JSON.parse(execFileSync(process.execPath, [bundle, "packet", "--from-issue", "9001", "--issue-json", issueFile, "--packets-dir", tmp, ...extra], { encoding: "utf8" }));
    return Object.fromEntries(Object.entries(out.models).map(([r, m]) => [r, m.model]));
  };

  // Dispatches each adapter role with the packet's model and returns the model the mocked CLI was given.
  const adapterModels = async (models) => {
    const seen = {};
    for (const role of Object.keys(MODEL_ASSIGNMENTS)) {
      const calls = [];
      const exec = async (cmd, args) => { calls.push(args); return { stdout: JSON.stringify({ session_id: "s" }) }; };
      const out = await runSpecialist({ role, prompt: "p", model: models[role], exec });
      seen[role] = { cli: calls[0][calls[0].indexOf("--model") + 1], dispatch: out.dispatch.model };
    }
    return seen;
  };
  const expectRoles = async (models) => {
    const seen = await adapterModels(models);
    for (const [role, { cli, dispatch }] of Object.entries(seen)) {
      assert.equal(cli, models[role], `${role}: CLI model`);
      assert.equal(dispatch, models[role], `${role}: dispatch record`);
    }
    return seen;
  };

  test("a simple issue with no complexity labels dispatches reporter, architect, reviewer, coder, tester and ux-designer on haiku", async () => {
    const models = packetModels("simple", ["area:ux", "area:study", "size:s"], `${AC}Risk Low`);
    assert.equal(models.coder, "haiku");
    const seen = await expectRoles(models);
    for (const role of ["architect", "reviewer", "coder", "tester", "ux-designer", "reporter"]) assert.equal(seen[role].cli, "haiku", role);
  });

  test("a medium issue (size m, stated reasoning medium) dispatches on sonnet", async () => {
    const models = packetModels("medium", ["area:study", "size:m"], `${AC}Reasoning: medium`);
    assert.equal(models.coder, "sonnet");
    const seen = await expectRoles(models);
    assert.equal(seen.architect.cli, "sonnet");
    assert.equal(seen.reporter.cli, "haiku");
  });

  test("a high-complexity migration dispatches architect, reviewer and coder on opus, and tester and ux-designer on sonnet", async () => {
    const models = packetModels("high", ["area:db", "size:l"], `${AC}Migration: yes\nReasoning: high`);
    const seen = await expectRoles(models);
    assert.equal(seen.architect.cli, "opus");
    assert.equal(seen.reviewer.cli, "opus");
    assert.equal(seen.coder.cli, "opus");
    assert.equal(seen.tester.cli, "sonnet");
    assert.equal(seen["ux-designer"].cli, "sonnet");
  });

  test("a reasoning failure on haiku dispatches the coder on sonnet, not opus", async () => {
    const models = packetModels("fail-haiku", ["area:ux", "area:study", "size:s"], `${AC}Risk Low`, ["--failure", "reasoning", "--prior-model", "haiku"]);
    assert.equal(models.coder, "sonnet");
    await expectRoles(models);
  });

  test("a reasoning failure on sonnet dispatches the coder on opus", async () => {
    const models = packetModels("fail-sonnet", ["area:ux", "area:study", "size:s"], `${AC}Risk Low`, ["--failure", "reasoning", "--prior-model", "sonnet"]);
    assert.equal(models.coder, "opus");
    await expectRoles(models);
  });

  test("an environment failure is fixed, not escalated: the coder stays on haiku", async () => {
    const models = packetModels("fail-env", ["area:ux", "area:study", "size:s"], `${AC}Risk Low`, ["--failure", "environment", "--prior-model", "sonnet"]);
    assert.equal(models.coder, "haiku");
    await expectRoles(models);
  });
});

describe("direct invocation baselines (AC 7.13.3)", () => {
  test("each agent file's model equals its baseline, and no agent defaults to opus", () => {
    for (const role of ROLES.filter((r) => r !== "qm-decision-maker")) {
      const file = path.join(repo, ".claude", "agents", `${role}.md`);
      const front = fs.readFileSync(file, "utf8").split("\n").slice(0, 10).join("\n");
      const declared = /^model:\s*(\w+)/m.exec(front)?.[1];
      assert.equal(declared, baselineModel(role), `${role} frontmatter`);
      assert.notEqual(declared, "opus", `${role} must not default to opus`);
    }
  });

  test("the qm-decision-maker agent file defaults to sonnet, never opus", () => {
    const front = fs.readFileSync(path.join(repo, ".claude", "agents", "qm-decision-maker.md"), "utf8").split("\n").slice(0, 10).join("\n");
    assert.equal(/^model:\s*(\w+)/m.exec(front)?.[1], "sonnet");
  });

  test("the adapter's baselines come from the same policy and are never opus", () => {
    for (const role of Object.keys(MODEL_ASSIGNMENTS)) {
      assert.equal(MODEL_ASSIGNMENTS[role].baseline, baselineModel(role), role);
      assert.notEqual(MODEL_ASSIGNMENTS[role].baseline, "opus", role);
    }
  });
});

describe("substitution is cheaper-only (AC 7.13.3)", () => {
  test("an available requested model is used as is", () => {
    assert.deepEqual(chooseAvailable("opus", ["haiku", "sonnet", "opus"]), { model: "opus", substituted: false });
  });

  test("a missing model is replaced by the nearest cheaper one, recorded", () => {
    const r = chooseAvailable("opus", ["haiku", "sonnet"]);
    assert.equal(r.model, "sonnet");
    assert.equal(r.substituted, true);
    assert.match(r.reason, /cheaper/);
  });

  test("a missing model with nothing cheaper available is unavailable, never upgraded", () => {
    assert.equal(chooseAvailable("haiku", ["sonnet", "opus"]).unavailable, true);
  });
});

describe("adapter dispatch (mocked CLI, AC 7.13.3)", () => {
  // A fake CLI: records the argv of each call and returns a valid JSON reply.
  const fakeCli = () => {
    const calls = [];
    const exec = async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: JSON.stringify({ session_id: "s-1" }) };
    };
    return { exec, calls };
  };
  const modelArg = (args) => args[args.indexOf("--model") + 1];

  test("a direct invocation with no packet runs on the role baseline, never opus", async () => {
    const { exec, calls } = fakeCli();
    const out = await runSpecialist({ role: "architect", prompt: "p", exec });
    assert.equal(modelArg(calls[0].args), "sonnet");
    assert.equal(out.dispatch.model, "sonnet");
    assert.equal(out.dispatch.requested, "sonnet");
    assert.equal(out.dispatch.substituted, false);
  });

  test("a packet's model is what runs, and the dispatch record names the role and the model", async () => {
    const { exec, calls } = fakeCli();
    const out = await runSpecialist({ role: "coder", prompt: "p", model: "opus", exec });
    assert.equal(modelArg(calls[0].args), "opus");
    assert.deepEqual(out.dispatch, { role: "coder", model: "opus", requested: "opus", substituted: false, reason: null });
  });

  test("a requested model that is unavailable is replaced only by a recorded cheaper one", async () => {
    const { exec, calls } = fakeCli();
    const out = await runSpecialist({ role: "reviewer", prompt: "p", model: "opus", availableModels: ["sonnet", "haiku"], exec });
    assert.equal(modelArg(calls[0].args), "sonnet");
    assert.equal(out.dispatch.substituted, true);
    assert.match(out.dispatch.reason, /opus/);
  });

  test("a haiku dispatch with no haiku available fails rather than running a more expensive model", async () => {
    const { exec, calls } = fakeCli();
    await assert.rejects(
      runSpecialist({ role: "reporter", prompt: "p", availableModels: ["sonnet", "opus"], exec }),
      (err) => err instanceof AdapterError && err.code === "MODEL_UNAVAILABLE",
    );
    assert.equal(calls.length, 0);
  });

  test("resolveModel with no model request uses the baseline", () => {
    assert.equal(resolveModel("coder").model, "sonnet");
    assert.equal(resolveModel("reporter").model, "haiku");
  });
});
