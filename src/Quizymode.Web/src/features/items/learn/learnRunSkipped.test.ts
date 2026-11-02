import { describe, expect, it } from "vitest";
import type { QuizRunScope } from "@/features/items/quiz/quizRun";
import {
  createLearnRun,
  getCurrentLearnItemId,
  reduceLearnRun,
  restoreLearnRun,
  summarizeLearnRun,
  toLearnCompletionSnapshot,
  type LearnRunState,
} from "./learnRun";

const scope: QuizRunScope = { kind: "collection", collectionId: "c-1" };
const WHEN = "2026-10-22T10:00:00.000Z";
const ids = ["item-1", "item-2", "item-3"];

function skipCurrent(run: LearnRunState): LearnRunState {
  return reduceLearnRun(run, { type: "skip-unavailable", itemId: getCurrentLearnItemId(run)!, completedAt: WHEN });
}

function answerCurrent(run: LearnRunState, isCorrect: boolean): LearnRunState {
  return reduceLearnRun(run, {
    type: "answer",
    itemId: getCurrentLearnItemId(run)!,
    selectedIndex: isCorrect ? 0 : 1,
    isCorrect,
    completedAt: WHEN,
  });
}

const roundTrip = (run: LearnRunState): LearnRunState | null => restoreLearnRun(JSON.parse(JSON.stringify(run)), scope, "guest");

describe("Learn skip for an unavailable picture (#403)", () => {
  it("moves on without recording an attempt or a miss", () => {
    const run = createLearnRun(scope, ids, "guest");
    const skippedId = getCurrentLearnItemId(run)!;
    const next = skipCurrent(run);

    expect(next.skipped).toEqual([skippedId]);
    expect(next.progress[skippedId]).toBeUndefined();
    expect(next.round.position).toBe(1);
    expect(summarizeLearnRun(next)).toMatchObject({ total: 2, skipped: 1, missedItemIds: [], firstTryCorrect: 0, mastered: 0 });
  });

  it("leaves the skipped item out of later rounds and out of completion", () => {
    let run = createLearnRun(scope, ids, "guest");
    const skippedId = getCurrentLearnItemId(run)!;
    run = skipCurrent(run);
    while (run.view === "active") run = reduceLearnRun(answerCurrent(run, true), { type: "advance" });
    expect(run.view).toBe("finished");

    expect(run.skipped).toEqual([skippedId]);
    expect(summarizeLearnRun(run)).toMatchObject({ total: 2, mastered: 2, isComplete: true });
    expect(toLearnCompletionSnapshot(run)).toMatchObject({ correct: 2, total: 2, missedItemIds: [] });
  });

  it("composes the next round without skipped items", () => {
    let run = createLearnRun(scope, ids, "guest");
    const skippedId = getCurrentLearnItemId(run)!;
    run = skipCurrent(run);
    run = reduceLearnRun(answerCurrent(run, false), { type: "advance" });
    run = reduceLearnRun(answerCurrent(run, false), { type: "advance" });
    expect(run.view).toBe("recap");

    const next = reduceLearnRun(run, { type: "next-round" });
    expect(next.round.itemIds).not.toContain(skippedId);
    expect(next.round.itemIds).toHaveLength(2);
  });

  it("finishes with nothing scored when every item is skipped and saves no session", () => {
    let run = createLearnRun(scope, ["only"], "guest");
    run = skipCurrent(run);

    expect(run.view).toBe("finished");
    expect(summarizeLearnRun(run)).toMatchObject({ total: 0, skipped: 1, isComplete: true });
    expect(toLearnCompletionSnapshot(run)).toBeNull();
    expect(roundTrip(run)?.view).toBe("finished");
  });

  it("ignores a skip for an answered item, a non-current item or a repeated skip", () => {
    const run = createLearnRun(scope, ids, "guest");
    expect(reduceLearnRun(run, { type: "skip-unavailable", itemId: "not-in-round", completedAt: WHEN })).toBe(run);
    const answered = answerCurrent(run, true);
    expect(skipCurrent(answered)).toBe(answered);
  });
});

describe("restoring Learn runs with skipped items (#403)", () => {
  it("reads a stored run without the skipped field as empty", () => {
    const run = answerCurrent(createLearnRun(scope, ids, "guest"), true);
    const stored = JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
    delete stored.skipped;
    expect(restoreLearnRun(stored, scope, "guest")?.skipped).toEqual([]);
  });

  it("round-trips a mid-round skip and rejects a bad skipped field", () => {
    const run = skipCurrent(createLearnRun(scope, ids, "guest"));
    expect(roundTrip(run)).toEqual(run);

    const stored = JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
    expect(restoreLearnRun({ ...stored, skipped: ["nope"] }, scope, "guest")).toBeNull();
    expect(restoreLearnRun({ ...stored, skipped: "item-1" }, scope, "guest")).toBeNull();
    expect(restoreLearnRun({ ...stored, skipped: [run.skipped[0], run.skipped[0]] }, scope, "guest")).toBeNull();
  });
});
