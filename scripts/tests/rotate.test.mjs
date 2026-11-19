import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ADAPTERS } from "../rotate/lib/adapters.mjs";
import { planGroups, runRotation } from "../rotate/lib/runner.mjs";
import { makeSsmTarget } from "../rotate/lib/target.mjs";
import { parseArgs } from "../rotate/rotate.mjs";

const inventory = JSON.parse(readFileSync(new URL("../rotate/secrets.json", import.meta.url), "utf8"));
const CANARY = "CANARY-NEW-SECRET-0123456789";
const CANARY_ID = "AKIACANARYID012345";

// A fake AWS plus a fake "provider" adapter. Records every call so tests can assert order and leaks.
function harness({ checkOk = true, failRevokeOnce = false } = {}) {
  const tmpRoot = mkdtempSync(join(tmpdir(), "rot-test-"));
  const calls = [];
  const logs = [];
  const store = new Map();
  const events = [];
  const aws = (args) => {
    calls.push(args.join(" "));
    if (args[1] === "put-parameter") {
      const file = args[args.indexOf("--value") + 1].replace("file://", "");
      assert.ok(existsSync(file), "value file exists while aws runs");
      store.set(args[args.indexOf("--name") + 1], readFileSync(file, "utf8"));
      return { status: 0, stdout: "2\n" };
    }
    if (args[1] === "get-parameter") return { status: 0, stdout: `${store.get(args[args.indexOf("--name") + 1])}\n` };
    return { status: 1, stdout: "" };
  };
  const adapter = {
    create: ({ entry }) => { events.push(`create:${entry.name}`); return { values: Object.fromEntries(Object.keys(entry.params).map((k) => [k, k === "id" ? CANARY_ID : CANARY])), oldRef: `old-${entry.name}` }; },
    check: ({ entry }) => { events.push(`check:${entry.name}`); return checkOk; },
    revoke: ({ entry }, oldRef) => { events.push(`revoke:${entry.name}:${oldRef}`); },
  };
  const adapters = { "aws-iam-key": adapter, browser: adapter };
  const state = { secrets: {}, redeployed: {} };
  const saved = [];
  const target = makeSsmTarget({ aws, prefix: inventory.ssmPrefix, tmpRoot });
  const base = { inventory, state, save: (s) => saved.push(JSON.stringify(s)), aws, target, adapters, log: (m) => logs.push(m), sleep: async () => {}, checkAttempts: 2 };
  return { base, calls, logs, store, events, state, saved, tmpRoot, cleanup: () => rmSync(tmpRoot, { recursive: true, force: true }) };
}

test("inventory covers every secret kind and each entry has a target parameter", () => {
  const names = inventory.secrets.map((s) => s.name);
  for (const n of ["media-s3-key", "gemini", "groq", "cerebras", "openrouter", "openai", "grafana-cloud", "github-seed-sync", "supabase-db"]) assert.ok(names.includes(n), n);
  for (const s of inventory.secrets) assert.ok(Object.keys(s.params).length > 0, s.name);
});

test("the database rotates last and alone", () => {
  const groups = planGroups(inventory);
  assert.equal(groups.at(-1).key, "supabase-db");
  assert.equal(groups.at(-1).entries.length, 1);
  assert.ok(!groups[0].entries.some((e) => e.name === "supabase-db"));
});

test("dry run is the default and makes no write call", async () => {
  assert.equal(parseArgs([]).apply, false);
  const h = harness();
  const result = await runRotation({ ...h.base, apply: false });
  assert.equal(h.calls.length, 0);
  assert.equal(h.events.length, 0);
  assert.ok(result.planned.includes("supabase-db"));
  h.cleanup();
});

test("apply runs create, store, redeploy, check, revoke with the database last", async () => {
  const h = harness();
  const order = [];
  await runRotation({ ...h.base, apply: true, redeploy: async (g) => order.push(`deploy:${g.key}`) });
  const seq = h.events;
  assert.ok(seq.indexOf("check:gemini") > seq.indexOf("create:gemini"));
  assert.ok(seq.indexOf("revoke:gemini:old-gemini") > seq.indexOf("check:gemini"));
  assert.ok(seq.indexOf("create:supabase-db") > seq.indexOf("revoke:openai:old-openai"), "db starts after the others are done");
  assert.deepEqual(order, ["deploy:no-downtime", "deploy:supabase-db"]);
  assert.equal(h.store.get("/quizymode/prod/Gemini/ApiKey"), CANARY);
  h.cleanup();
});

test("a failing check stops the run with nothing revoked", async () => {
  const h = harness({ checkOk: false });
  await assert.rejects(runRotation({ ...h.base, apply: true, redeploy: async () => {} }), /failed its check/);
  assert.ok(!h.events.some((e) => e.startsWith("revoke:")));
  h.cleanup();
});

test("without a redeploy the run stops before any check or revoke, then resumes with --deployed", async () => {
  const h = harness();
  const first = await runRotation({ ...h.base, apply: true, only: ["gemini"] });
  assert.equal(first.stoppedForDeploy, "no-downtime");
  assert.ok(!h.events.some((e) => e.startsWith("check:") || e.startsWith("revoke:")));
  const second = await runRotation({ ...h.base, apply: true, only: ["gemini"], deployed: true });
  assert.deepEqual(second.rotated, ["gemini"]);
  assert.equal(h.events.filter((e) => e === "create:gemini").length, 1, "no second create");
  h.cleanup();
});

test("an interrupted run resumes without repeating a revoke", async () => {
  const h = harness();
  await runRotation({ ...h.base, apply: true, only: ["gemini"], redeploy: async () => {} });
  const again = await runRotation({ ...h.base, apply: true, only: ["gemini"], redeploy: async () => {} });
  assert.deepEqual(again.rotated, []);
  assert.equal(h.events.filter((e) => e.startsWith("revoke:gemini")).length, 1);
  h.cleanup();
});

test("a secret value never appears in aws arguments, logs or the state file, and temp files are removed", async () => {
  const h = harness();
  await runRotation({ ...h.base, apply: true, redeploy: async () => {} });
  const everything = [h.calls.join("\n"), h.logs.join("\n"), h.saved.join("\n")].join("\n");
  assert.doesNotMatch(everything, new RegExp(CANARY));
  assert.doesNotMatch(everything, new RegExp(CANARY_ID));
  assert.deepEqual(readdirSync(h.tmpRoot), [], "no temp files left");
  h.cleanup();
});

test("a failed put-parameter still removes the temp file and leaks nothing", () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "rot-test-"));
  const aws = () => ({ status: 1, stdout: "" });
  const target = makeSsmTarget({ aws, prefix: "/p", tmpRoot });
  assert.throws(() => target.put("A/B", CANARY), (e) => !String(e.message).includes(CANARY));
  assert.deepEqual(readdirSync(tmpRoot), []);
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("aws-iam-key: creates a second key, checks with it and deletes the old one", async () => {
  const calls = [];
  const aws = (args, opts) => {
    calls.push(args.join(" "));
    if (args[1] === "list-access-keys") return { status: 0, stdout: '["AKIAOLD"]' };
    if (args[1] === "create-access-key") return { status: 0, stdout: JSON.stringify({ AccessKey: { AccessKeyId: "AKIANEW", SecretAccessKey: CANARY } }) };
    if (args[0] === "sts") { assert.equal(opts.env.AWS_SECRET_ACCESS_KEY, CANARY); return { status: 0, stdout: "123" }; }
    return { status: 0, stdout: "" };
  };
  const entry = inventory.secrets.find((s) => s.name === "media-s3-key");
  const made = ADAPTERS["aws-iam-key"].create({ entry, aws });
  assert.equal(made.oldRef, "AKIAOLD");
  assert.ok(ADAPTERS["aws-iam-key"].check({ aws }, made.values));
  ADAPTERS["aws-iam-key"].revoke({ entry, aws }, made.oldRef);
  assert.ok(calls.some((c) => c.startsWith("iam delete-access-key") && c.includes("AKIAOLD")));
  assert.doesNotMatch(calls.join("\n"), new RegExp(CANARY));
});

test("aws-iam-key refuses when the user already has two keys", () => {
  const aws = () => ({ status: 0, stdout: '["A","B"]' });
  assert.throws(() => ADAPTERS["aws-iam-key"].create({ entry: inventory.secrets[0], aws }), /already has 2 access keys/);
});

test("unknown --only names are rejected", async () => {
  const h = harness();
  await assert.rejects(runRotation({ ...h.base, apply: false, only: ["nope"] }), /unknown secret/);
  h.cleanup();
});

import { connectionParts, npgsqlValue, withPassword } from "../rotate/recipes/supabase-db.mjs";

test("supabase-db recipe replaces only the password and quotes awkward characters", () => {
  const cs = "Host=db.example.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=OLDPASS;SSL Mode=Require";
  assert.equal(withPassword(cs, "NEWPASS1234567890"), "Host=db.example.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=NEWPASS1234567890;SSL Mode=Require");
  assert.equal(npgsqlValue('a;b"c'), '"a;b""c"');
  assert.match(withPassword(cs, "x;y-0123456789abc"), /Password="x;y-0123456789abc";SSL Mode/);
  assert.throws(() => withPassword("Host=h;Username=u", "p"), /no Password/);
  assert.deepEqual(connectionParts(cs), { host: "db.example.supabase.co", port: "5432", user: "postgres", db: "postgres" });
});

import { httpCheck } from "../rotate/recipes/_lib.mjs";

test("every browser entry in the inventory has a recipe file except the ones still to be walked", async () => {
  const { existsSync } = await import("node:fs");
  const missing = inventory.secrets.filter((s) => s.method === "browser" && !existsSync(new URL(`../rotate/recipes/${s.provider}.mjs`, import.meta.url))).map((s) => s.name);
  assert.deepEqual(missing.sort(), ["cerebras"]);
});

test("provider recipes export create, check and revoke", async () => {
  for (const p of ["groq", "openrouter", "openai", "github-pat", "supabase-db", "gemini", "grafana"]) {
    const r = await import(`../rotate/recipes/${p}.mjs`);
    for (const fn of ["create", "check", "revoke"]) assert.equal(typeof r[fn], "function", `${p}.${fn}`);
  }
});

test("httpCheck sends the key in a header only and reports ok or not", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true }; };
  assert.equal(await httpCheck("https://api.example/v1/models", { Authorization: `Bearer ${CANARY}` }, fetchImpl), true);
  assert.ok(!seen.url.includes(CANARY));
  assert.equal(await httpCheck("https://x", {}, async () => { throw new Error(CANARY); }), false);
});
