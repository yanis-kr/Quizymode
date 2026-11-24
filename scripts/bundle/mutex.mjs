// One heavy command at a time across the lanes and the integrator (#761 gap 13, AC 7.19.32). One lock file per name under
// <qm>/locks/. A lock whose heartbeat is older than MUTEX_STALE_MINUTES, or that cannot be read, is taken over, so a crashed
// session cannot hold the mutex forever. Only the holder can release it.
import fs from "node:fs";
import path from "node:path";

export const MUTEX_NAMES = ["dotnet", "release-merge"];
export const MUTEX_STALE_MINUTES = 30;

export function mutexFile(qmDir, name) { return path.join(qmDir, "locks", `${name}.json`); }

// undefined: no file. null: a file that is not readable JSON (taken over quietly).
function readLock(file) {
  if (!fs.existsSync(file)) return undefined;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function isStale(lock, nowMs) {
  return !lock.heartbeatAt || nowMs - Date.parse(lock.heartbeatAt) > MUTEX_STALE_MINUTES * 60000;
}

/**
 * Takes the mutex for `holder`. Returns { acquired: true, takenOver } or { acquired: false, holder: <the live lock> }.
 * A holder that already has it refreshes its heartbeat.
 */
export function acquireMutex({ qmDir, name, holder, nowMs = Date.now() }) {
  if (!MUTEX_NAMES.includes(name)) throw new Error(`unknown mutex '${name}'`);
  const file = mutexFile(qmDir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const at = new Date(nowMs).toISOString();
  const current = readLock(file);
  if (current === undefined) {
    const fresh = { holder, acquiredAt: at, heartbeatAt: at };
    try {
      fs.writeFileSync(file, JSON.stringify(fresh, null, 2) + "\n", { flag: "wx" });
      return { acquired: true, takenOver: false };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      return acquireMutex({ qmDir, name, holder, nowMs }); // another session wrote it first: judge that lock
    }
  }
  if (current && current.holder !== holder && !isStale(current, nowMs)) return { acquired: false, holder: current };
  const mine = current?.holder === holder;
  const lock = mine ? { ...current, heartbeatAt: at } : { holder, acquiredAt: at, heartbeatAt: at };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lock, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
  return { acquired: true, takenOver: Boolean(current) && !mine };
}

/** Releases the mutex when `holder` holds it. Never removes another holder's lock. */
export function releaseMutex({ qmDir, name, holder }) {
  if (!MUTEX_NAMES.includes(name)) throw new Error(`unknown mutex '${name}'`);
  const file = mutexFile(qmDir, name);
  const current = readLock(file);
  if (current === undefined) return { released: false, reason: `mutex '${name}' is not held` };
  if (current === null || current.holder !== holder) return { released: false, reason: `mutex '${name}' is held by ${current?.holder ?? "an unreadable lock"}, not ${holder}` };
  fs.rmSync(file, { force: true });
  return { released: true };
}
