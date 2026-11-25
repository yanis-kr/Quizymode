// githubAutoMerge (AC 7.19.11): with the envelope flag true, ship arms GitHub auto-merge instead of merging itself.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordReview, ship } from "../release/release.mjs";

// Temp folders this file makes are removed when the file ends, so %TEMP% does not collect qm-* folders (#761).
const madeDirs = [];
const mkTmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); madeDirs.push(d); return d; };
after(() => { for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true }); });

const HEAD = "b94b6a8e9d50404823d017103d05294fa3e8a05d";

function fakeGh(routes) {
  const deps = {
    calls: [],
    gh(args) {
      const line = args.join(" ");
      deps.calls.push(line);
      const key = Object.keys(routes).find((k) => line.includes(k));
      if (!key) throw new Error(`unrouted gh call: ${line}`);
      const value = routes[key];
      return typeof value === "function" ? value(args) : typeof value === "string" ? value : JSON.stringify(value);
    },
  };
  return deps;
}

const openPending = { state: "OPEN", headRefOid: HEAD, statusCheckRollup: [{ name: "release-ready", status: "IN_PROGRESS", conclusion: "" }] };

test("AC 7.19.11: githubAutoMerge true arms auto-merge on an open PR and never merges it directly", () => {
  const root = mkTmp("automerge-");
  recordReview({ pr: 770, head: HEAD, clean: true, root });
  const deps = fakeGh({ "pr view": openPending, "pr merge": "" });
  deps.acGate = () => ({ ok: true, detail: "" });
  const r = ship({ pr: 770, issues: [761], root, deps, githubAutoMerge: true });
  assert.equal(r.ok, true);
  assert.equal(r.class, "armed");
  assert.equal(deps.calls.at(-1), `pr merge 770 --auto --merge --match-head-commit ${HEAD}`);
  assert.equal(deps.calls.some((c) => c.startsWith("pr merge") && !c.includes("--auto")), false, "no direct merge");
});

test("AC 7.19.11: githubAutoMerge false keeps the direct merge path (refused while checks are pending)", () => {
  const root = mkTmp("automerge-");
  const deps = fakeGh({ "pr view": openPending, "pr merge": "" });
  const r = ship({ pr: 770, issues: [761], root, deps, githubAutoMerge: false });
  assert.equal(r.ok, false);
  assert.equal(r.class, "gate");
  assert.equal(deps.calls.some((c) => c.startsWith("pr merge")), false);
});
