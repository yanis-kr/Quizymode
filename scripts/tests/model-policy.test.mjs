// AC 7.13.3: the shared model routing policy, its direct-invocation baselines, and the Claude adapter's dispatch behaviour.
// Mocks only: no test calls a real model or the claude CLI.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeModel, baselineModel, chooseAvailable, ROLES } from "../automation/model-policy.mjs";
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

  test("an environment failure is fixed, not escalated; a reasoning failure lets the coder use opus", () => {
    assert.equal(model("coder", { ...SIMPLE, failure: "environment" }), "haiku");
    assert.equal(model("coder", { ...SIMPLE, failure: "reasoning" }), "opus");
    assert.equal(model("tester", { ...SIMPLE, failure: "reasoning" }), "sonnet");
  });

  test("every routing decision carries a reason that names what raised it", () => {
    assert.match(routeModel("architect", HIGH).reason, /risk high/);
    assert.match(routeModel("coder", SIMPLE).reason, /every dimension low/);
  });

  test("unknown roles are refused", () => {
    assert.throws(() => routeModel("project-manager", SIMPLE));
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
