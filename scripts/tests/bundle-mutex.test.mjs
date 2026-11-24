// Tests for #761 gap 13 (AC 7.19.32): one heavy command at a time, with a stale takeover. Temp folders only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireMutex, releaseMutex, mutexFile, MUTEX_STALE_MINUTES } from "../bundle/mutex.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "qm-mutex-"));
const T0 = Date.parse("2026-11-23T10:00:00Z");

// AC 7.19.32: a second holder is refused while the first holds the mutex; the first holder may take it again to refresh.
test("AC 7.19.32: a second holder is refused while the first holds the mutex, and the first may refresh", () => {
  const q = tmp();
  assert.deepEqual(acquireMutex({ qmDir: q, name: "dotnet", holder: "lane-a", nowMs: T0 }), { acquired: true, takenOver: false });
  const second = acquireMutex({ qmDir: q, name: "dotnet", holder: "lane-b", nowMs: T0 + 60000 });
  assert.equal(second.acquired, false);
  assert.equal(second.holder.holder, "lane-a");
  assert.equal(acquireMutex({ qmDir: q, name: "dotnet", holder: "lane-a", nowMs: T0 + 120000 }).acquired, true);
});

// AC 7.19.32: a lock with no heartbeat for MUTEX_STALE_MINUTES is taken over; a live one is not.
test("AC 7.19.32: a mutex with no heartbeat for 30 minutes is taken over; a live one is not", () => {
  const q = tmp();
  acquireMutex({ qmDir: q, name: "dotnet", holder: "lane-a", nowMs: T0 });
  assert.equal(acquireMutex({ qmDir: q, name: "dotnet", holder: "lane-b", nowMs: T0 + (MUTEX_STALE_MINUTES - 1) * 60000 }).acquired, false);
  assert.deepEqual(acquireMutex({ qmDir: q, name: "dotnet", holder: "lane-b", nowMs: T0 + (MUTEX_STALE_MINUTES + 1) * 60000 }), { acquired: true, takenOver: true });
});

// AC 7.19.32: only the holder releases; a released mutex can be taken again; an unknown name is refused.
test("AC 7.19.32: only the holder releases, a released mutex can be taken again, and an unknown name is refused", () => {
  const q = tmp();
  acquireMutex({ qmDir: q, name: "release-merge", holder: "lane-a", nowMs: T0 });
  assert.equal(releaseMutex({ qmDir: q, name: "release-merge", holder: "lane-b" }).released, false);
  assert.equal(fs.existsSync(mutexFile(q, "release-merge")), true, "a non-holder never removes the lock");
  assert.deepEqual(releaseMutex({ qmDir: q, name: "release-merge", holder: "lane-a" }), { released: true });
  assert.equal(acquireMutex({ qmDir: q, name: "release-merge", holder: "lane-b", nowMs: T0 }).acquired, true);
  assert.throws(() => acquireMutex({ qmDir: q, name: "docker", holder: "x" }), /unknown mutex/);
});

// AC 7.19.32: an unreadable lock file is taken over rather than blocking every session.
test("AC 7.19.32: an unreadable lock file is taken over rather than blocking forever", () => {
  const q = tmp();
  fs.mkdirSync(path.join(q, "locks"), { recursive: true });
  fs.writeFileSync(mutexFile(q, "dotnet"), "not json");
  assert.deepEqual(acquireMutex({ qmDir: q, name: "dotnet", holder: "lane-a", nowMs: T0 }), { acquired: true, takenOver: false });
});
