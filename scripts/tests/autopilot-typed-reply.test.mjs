// The owner's typed "start autopilot" approves a shown manifest hash; the autopilot skill documents that path (AC 7.19.19).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkUserReply } from "../bundle/approval-reply.mjs";

const HASH = "abcdef1234567890";

test("AC 7.19.19: a typed 'start autopilot' approves the hash the owner was shown", () => {
  assert.deepEqual(checkUserReply({ reply: "start autopilot", given: HASH.slice(0, 8) }), { ok: true, kind: "start-autopilot" });
  assert.deepEqual(checkUserReply({ reply: "Start Autopilot please", given: HASH.slice(0, 8) }), { ok: true, kind: "start-autopilot" });
});

test("AC 7.19.19: an 'ok' or an empty reply is not an approval", () => {
  assert.equal(checkUserReply({ reply: "ok", given: HASH.slice(0, 8) }).ok, false);
  assert.equal(checkUserReply({ reply: "", given: HASH.slice(0, 8) }).ok, false);
});

test("AC 7.19.19: a reply that names another hash is refused", () => {
  const r = checkUserReply({ reply: "approve 99999999", given: HASH.slice(0, 8) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /different hash/);
});

test("AC 7.19.19: the autopilot skill documents the typed reply and stays owner-invoked", () => {
  const skill = fs.readFileSync(new URL("../../.claude/skills/qm-bundle-autopilot/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /^disable-model-invocation: true$/m, "the skill must stay owner-invoked");
  assert.match(skill, /--user-reply "<the owner's message, verbatim>"/);
  assert.match(skill, /`start autopilot`/);
  assert.match(skill, /--standing/, "the standing envelope path stays");
});
