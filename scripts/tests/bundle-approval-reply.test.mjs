// The owner's approval reply for a bundle manifest (#761, AC 7.19.16). Pure function, no GitHub or disk access.
import test from "node:test";
import assert from "node:assert/strict";
import { checkUserReply } from "../bundle/approval-reply.mjs";

test("AC 7.19.16: 'approve <hash prefix>' matching --hash is accepted", () => {
  assert.deepEqual(checkUserReply({ reply: "approve 0ebb9bf1", given: "0ebb9bf1" }), { ok: true, kind: "approve" });
});

test("AC 7.19.16: 'start autopilot' is accepted as the owner's approval of the shown hash", () => {
  assert.deepEqual(checkUserReply({ reply: "start autopilot", given: "0ebb9bf1" }), { ok: true, kind: "start-autopilot" });
  assert.deepEqual(checkUserReply({ reply: "Start Autopilot please", given: "0ebb9bf1" }), { ok: true, kind: "start-autopilot" });
});

test("AC 7.19.16: a reply naming a different hash is refused, even with 'start autopilot'", () => {
  const r = checkUserReply({ reply: "start autopilot and approve deadbeef", given: "0ebb9bf1" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /different hash/);
});

test("AC 7.19.16: 'ok' or other text is not an approval", () => {
  for (const reply of ["ok", "yes go", "proceed", "approve"]) {
    assert.equal(checkUserReply({ reply, given: "0ebb9bf1" }).ok, false, reply);
  }
});

test("AC 7.19.16: a missing reply or a malformed --hash is refused", () => {
  assert.equal(checkUserReply({ reply: "", given: "0ebb9bf1" }).ok, false);
  assert.equal(checkUserReply({ reply: "start autopilot", given: "0ebb" }).ok, false);
  assert.equal(checkUserReply({ reply: "start autopilot", given: "zzzzzzzz" }).ok, false);
});
