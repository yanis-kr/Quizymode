// Autopilot halt file (#761 v2 design E): two or more `defect` failures in one batch stop the next run until the owner
// looks. Kept apart from the release halt (.qm/release-halt.json, release.mjs) so each stop can be cleared on its own.
import fs from "node:fs";
import path from "node:path";

export const DEFECTS_TO_HALT = 2;

/** The halt file for the main checkout's .qm folder. */
export function haltFile(qmDir) {
  return path.join(qmDir, "autopilot-halt.json");
}

/** True when this many defect failures in one batch call for a halt. */
export function haltNeeded(defectCount) {
  return defectCount >= DEFECTS_TO_HALT;
}

/** Null when no halt is set. An unreadable halt file still counts as a halt, so it is never ignored. */
export function haltState(qmDir) {
  const file = haltFile(qmDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { unreadable: true, file };
  }
}

/** Writes the halt record. The owner clears it by deleting the file after reviewing the defects. */
export function writeHalt(qmDir, record) {
  fs.mkdirSync(qmDir, { recursive: true });
  fs.writeFileSync(haltFile(qmDir), JSON.stringify(record, null, 2) + "\n", "utf8");
}
