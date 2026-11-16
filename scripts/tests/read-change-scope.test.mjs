import test from "node:test";
import assert from "node:assert/strict";
import { readScope } from "../ci/read-change-scope.mjs";

test("explicit false is kept as false", () => {
  assert.deepEqual(readScope('{"web":false,"api":false}'), { web: false, api: false });
});
test("only the false flag turns off", () => {
  assert.deepEqual(readScope('{"web":true,"api":false}'), { web: true, api: false });
  assert.deepEqual(readScope('{"web":false,"api":true}'), { web: false, api: true });
});
test("missing file deploys everything", () => {
  assert.deepEqual(readScope(null), { web: true, api: true });
});
test("invalid JSON deploys everything", () => {
  assert.deepEqual(readScope("{not json"), { web: true, api: true });
});
test("an object with neither key deploys everything", () => {
  assert.deepEqual(readScope("{}"), { web: true, api: true });
});
test("a non-object JSON value deploys everything", () => {
  assert.deepEqual(readScope("null"), { web: true, api: true });
  assert.deepEqual(readScope("[false]"), { web: true, api: true });
});
test("non-boolean false-like values do not turn a flag off", () => {
  assert.deepEqual(readScope('{"web":"false","api":0}'), { web: true, api: true });
});
