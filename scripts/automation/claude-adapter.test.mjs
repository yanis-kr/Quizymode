// Unit tests for the Claude provider adapter (DRAFT — see
// controller-contract.stub.mjs). Uses Node's built-in test runner so this
// has zero extra dependencies and does not touch package.json.
//
// Run: node --test scripts/automation/claude-adapter.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveModel,
  checkCliCapabilities,
  runSpecialist,
  resolveConflict,
  assertPublishableEvidence,
  AdapterError,
} from "./claude-adapter.mjs";

function fakeExecOnce(result) {
  return async () => result;
}

function fakeExecSequence(results) {
  let i = 0;
  return async () => {
    const r = results[Math.min(i, results.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return r;
  };
}

describe("resolveModel", () => {
  test("uses the primary model when available", () => {
    const { model, substituted } = resolveModel("architect", { availableModels: ["opus", "sonnet"] });
    assert.equal(model, "opus");
    assert.equal(substituted, false);
  });

  test("falls back and records the substitution when primary is unavailable", () => {
    const { model, substituted, reason } = resolveModel("architect", { availableModels: ["sonnet"] });
    assert.equal(model, "sonnet");
    assert.equal(substituted, true);
    assert.match(reason, /opus/);
  });

  test("rejects an unknown role", () => {
    assert.throws(() => resolveModel("project-manager"), AdapterError);
  });
});

describe("checkCliCapabilities", () => {
  test("returns capabilities for a logged-in subscription account", async () => {
    const exec = fakeExecSequence([
      { stdout: "2.1.218 (Claude Code)\n" },
      { stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "pro", email: "a@b.com" }) },
    ]);
    const caps = await checkCliCapabilities({ exec });
    assert.equal(caps.subscriptionType, "pro");
    assert.equal(caps.authMethod, "claude.ai");
  });

  test("rejects a paid API-key fallback", async () => {
    const exec = fakeExecSequence([
      { stdout: "2.1.218\n" },
      { stdout: JSON.stringify({ loggedIn: true, apiProvider: "apiKey" }) },
    ]);
    await assert.rejects(() => checkCliCapabilities({ exec }), (err) => {
      assert.equal(err.code, "PAID_API_FALLBACK_FORBIDDEN");
      return true;
    });
  });

  test("rejects when not logged in", async () => {
    const exec = fakeExecSequence([
      { stdout: "2.1.218\n" },
      { stdout: JSON.stringify({ loggedIn: false }) },
    ]);
    await assert.rejects(() => checkCliCapabilities({ exec }), (err) => {
      assert.equal(err.code, "NOT_AUTHENTICATED");
      return true;
    });
  });

  test("rejects malformed auth JSON", async () => {
    const exec = fakeExecSequence([{ stdout: "2.1.218\n" }, { stdout: "not json" }]);
    await assert.rejects(() => checkCliCapabilities({ exec }), (err) => {
      assert.equal(err.code, "MALFORMED_OUTPUT");
      return true;
    });
  });
});

describe("runSpecialist", () => {
  test("successful handoff returns the parsed result", async () => {
    const exec = fakeExecOnce({ stdout: JSON.stringify({ session_id: "s-1", ok: true }) });
    const out = await runSpecialist({ role: "coder", prompt: "do the thing", exec });
    assert.equal(out.role, "coder");
    assert.equal(out.sessionId, "s-1");
    assert.deepEqual(out.result, { session_id: "s-1", ok: true });
    assert.equal(out.attempts, 1);
  });

  test("malformed CLI output raises MALFORMED_OUTPUT, not a silent pass", async () => {
    const exec = fakeExecOnce({ stdout: "<<not json>>" });
    await assert.rejects(() => runSpecialist({ role: "tester", prompt: "x", exec }), (err) => {
      assert.equal(err.code, "MALFORMED_OUTPUT");
      return true;
    });
  });

  test("passes --resume with the prior session id when resuming after an interruption", async () => {
    let capturedArgs;
    const exec = async (_bin, args) => {
      capturedArgs = args;
      return { stdout: JSON.stringify({ session_id: "s-1" }) };
    };
    await runSpecialist({ role: "coder", prompt: "continue", sessionId: "s-1", resume: true, exec });
    assert.ok(capturedArgs.includes("--resume"));
    assert.equal(capturedArgs[capturedArgs.indexOf("--resume") + 1], "s-1");
  });

  test("retries once on a quota/overload error, then succeeds", async () => {
    const quotaError = Object.assign(new Error("request failed"), { stderr: "429 rate limit exceeded" });
    const exec = fakeExecSequence([quotaError, { stdout: JSON.stringify({ session_id: "s-2" }) }]);
    const out = await runSpecialist({
      role: "coder",
      prompt: "x",
      exec,
      sleep: async () => {}, // skip real backoff delay in tests
    });
    assert.equal(out.attempts, 2);
    assert.equal(out.sessionId, "s-2");
  });

  test("exhausts retries and reports a blocked state instead of looping forever", async () => {
    const quotaError = Object.assign(new Error("overloaded"), { stderr: "model overloaded" });
    const exec = fakeExecSequence([quotaError, quotaError, quotaError]);
    await assert.rejects(
      () => runSpecialist({ role: "coder", prompt: "x", exec, maxAttempts: 2, sleep: async () => {} }),
      (err) => {
        assert.equal(err.code, "QUOTA_RETRIES_EXHAUSTED");
        return true;
      },
    );
  });

  test("a non-quota CLI failure is not retried and is reported as-is", async () => {
    const hardError = Object.assign(new Error("tool not permitted"), { stderr: "permission denied" });
    const exec = fakeExecOnce(hardError instanceof Error ? hardError : hardError);
    const execThatThrows = async () => {
      throw hardError;
    };
    await assert.rejects(() => runSpecialist({ role: "coder", prompt: "x", exec: execThatThrows }), (err) => {
      assert.equal(err.code, "CLI_INVOCATION_FAILED");
      return true;
    });
  });

  test("refuses bypassPermissions regardless of caller intent", async () => {
    await assert.rejects(
      () => runSpecialist({ role: "coder", prompt: "x", permissionMode: "bypassPermissions", exec: fakeExecOnce({ stdout: "{}" }) }),
      (err) => {
        assert.equal(err.code, "PERMISSION_POLICY_VIOLATION");
        return true;
      },
    );
  });
});

describe("resolveConflict", () => {
  test("fetches, rebases onto the base ref, and re-runs the coder role", async () => {
    const calls = [];
    const exec = async (bin, args, opts) => {
      calls.push([bin, args, opts]);
      return { stdout: "" };
    };
    let coderCallArgs;
    const runSpecialistFn = async (opts) => {
      coderCallArgs = opts;
      return { role: "coder", result: { ok: true } };
    };

    await resolveConflict({ repoPath: "/repo", baseRef: "main", prompt: "resolve conflict", exec, runSpecialistFn });

    assert.deepEqual(calls[0][0], "git");
    assert.deepEqual(calls[0][1], ["fetch", "origin", "main"]);
    assert.deepEqual(calls[1][1], ["rebase", "origin/main"]);
    assert.equal(coderCallArgs.role, "coder");
  });
});

describe("assertPublishableEvidence", () => {
  test("rejects evidence missing required fields instead of letting it publish", () => {
    assert.throws(
      () => assertPublishableEvidence({ issueNumber: 108 }),
      (err) => {
        assert.equal(err.code, "INCOMPLETE_EVIDENCE");
        assert.ok(err.details.missing.includes("testedSha"));
        return true;
      },
    );
  });

  test("rejects a PASS criterion with no test or evidence link", () => {
    assert.throws(() =>
      assertPublishableEvidence({
        issueNumber: 108,
        testedSha: "abc123",
        environment: "ci",
        dateIso: "2026-10-15",
        prUrl: "https://example.invalid/pr/1",
        criteria: [{ name: "AC1", status: "PASS" }],
      }),
    );
  });

  test("accepts complete, well-formed evidence", () => {
    const evidence = {
      issueNumber: 108,
      testedSha: "abc123",
      environment: "ci",
      dateIso: "2026-10-15",
      prUrl: "https://example.invalid/pr/1",
      criteria: [{ name: "AC1", status: "PASS", test: "it does the thing" }],
    };
    assert.deepEqual(assertPublishableEvidence(evidence), evidence);
  });
});
