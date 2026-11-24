// Rolling lanes (#761 v2 design C): the next issue one lane should work, in manifest order. Pure; the CLI reads the state.
// A lane takes its own in-progress issue first (a resumed run), then the first pending issue whose in-bundle dependencies
// are usable. A dependency that failed, was parked or blocked makes its dependent wait (skipped), not block the lane.

// Dependencies that are finished or about to be: the dependent may start (stacked on its branch when not yet integrated).
const USABLE = new Set(["implemented", "validated", "integrated", "released", "verified", "closed", "skipped_already_done"]);
// Dependencies that will not finish in this batch: the dependent is skipped with the reason.
const UNUSABLE = new Set(["blocked", "deferred", "parked", "failed", "validation_failed"]);
// Dependencies that are usable but still on a branch (not on main yet): the dependent is stacked on that branch.
const UNINTEGRATED = new Set(["implemented", "validated"]);

/**
 * @param issues  manifest issues: { number, order, dependsOn }
 * @param status  (number) => issue status string
 * @param laneOf  (number) => "a" | "b" | null
 * @param lane    "a" | "b"
 * @returns { issue, stackOn, reason, skipped }
 */
export function nextForLane({ issues, status, laneOf, lane }) {
  const mine = [...issues].sort((x, y) => x.order - y.order).filter((i) => laneOf(i.number) === lane);
  const skipped = [];
  const resume = mine.find((i) => status(i.number) === "in_progress");
  if (resume) return { issue: resume.number, stackOn: null, reason: "resume: already in progress", skipped };
  for (const it of mine) {
    if (status(it.number) !== "pending") continue;
    const deps = it.dependsOn.filter((d) => typeof d === "number");
    const bad = deps.filter((d) => UNUSABLE.has(status(d)));
    if (bad.length) {
      skipped.push({ issue: it.number, reason: `depends on ${bad.map((d) => `#${d} (${status(d)})`).join(", ")}` });
      continue;
    }
    const waiting = deps.filter((d) => !USABLE.has(status(d)));
    if (waiting.length) continue; // an earlier dependency is still pending in this batch; it comes first in order
    const stack = deps.filter((d) => UNINTEGRATED.has(status(d)));
    return {
      issue: it.number,
      stackOn: stack.length ? stack[stack.length - 1] : null,
      reason: stack.length ? `stacked on #${stack[stack.length - 1]}'s branch` : "next pending issue in lane",
      skipped,
    };
  }
  return { issue: null, stackOn: null, reason: "no pending issue in this lane", skipped };
}
