import { describe, expect, it } from "vitest";
import type { ItemResponse } from "@/types/api";
import { getQuizOptions, type QuizRunScope } from "@/features/items/quiz/quizRun";
import {
  LEARN_MAX_ITEMS,
  LEARN_ROUND_SIZE,
  createLearnRun,
  deriveLearnProgress,
  getCurrentLearnItemId,
  getLearnAttemptInRound,
  getLearnOptions,
  reduceLearnRun,
  restoreLearnRun,
  seededShuffle,
  summarizeLearnRun,
  toLearnCompletionSnapshot,
  type LearnRunState,
} from "./learnRun";

const scope: QuizRunScope = { kind: "collection", collectionId: "c-1" };
const categoryScope: QuizRunScope = {
  kind: "category",
  category: "Science",
  navigationKeywords: ["a"],
  filterKeywords: [],
  quizSize: 10,
};
const WHEN = "2026-10-22T10:00:00.000Z";

const ids = (count: number): string[] => Array.from({ length: count }, (_, index) => `item-${index + 1}`);

function answer(run: LearnRunState, isCorrect: boolean): LearnRunState {
  const itemId = getCurrentLearnItemId(run)!;
  return reduceLearnRun(run, { type: "answer", itemId, selectedIndex: isCorrect ? 0 : 1, isCorrect, completedAt: WHEN });
}

/** Plays the run to the end; `isCorrect(itemId, attemptNumber)` decides each answer. */
function play(
  start: LearnRunState,
  isCorrect: (itemId: string, attemptNumber: number) => boolean,
  inspectRound?: (round: string[], before: LearnRunState) => void,
): { run: LearnRunState; rounds: string[][] } {
  let run = start;
  const rounds: string[][] = [];
  for (let guard = 0; guard < 10_000 && run.view !== "finished"; guard += 1) {
    if (run.view === "active") {
      if (run.round.position === 0) {
        rounds.push([...run.round.itemIds]);
        inspectRound?.(run.round.itemIds, run);
      }
      const itemId = getCurrentLearnItemId(run)!;
      const attemptNumber = (run.progress[itemId]?.attempts.length ?? 0) + 1;
      run = answer(run, isCorrect(itemId, attemptNumber));
      run = reduceLearnRun(run, { type: "advance" });
    } else {
      run = reduceLearnRun(run, { type: "next-round" });
    }
  }
  return { run, rounds };
}

describe("seededShuffle", () => {
  it("is deterministic for a seed and keeps every value", () => {
    const values = ids(20);
    expect(seededShuffle(values, "seed")).toEqual(seededShuffle(values, "seed"));
    expect(seededShuffle(values, "seed")).not.toEqual(values);
    expect([...seededShuffle(values, "seed")].sort()).toEqual([...values].sort());
  });
});

describe("deriveLearnProgress", () => {
  const attempt = (isCorrect: boolean, round: number) => ({ round, selectedIndex: 0, isCorrect, answerFormat: "multiple-choice" as const });

  it("masters a correct first attempt immediately", () => {
    expect(deriveLearnProgress([attempt(true, 1)])).toEqual({ streak: 1, mastered: true });
  });

  it("needs two correct in a row after a miss, and a miss resets the streak", () => {
    expect(deriveLearnProgress([attempt(false, 1)])).toEqual({ streak: 0, mastered: false });
    expect(deriveLearnProgress([attempt(false, 1), attempt(true, 2)])).toEqual({ streak: 1, mastered: false });
    expect(deriveLearnProgress([attempt(false, 1), attempt(true, 2), attempt(false, 3)])).toEqual({ streak: 0, mastered: false });
    expect(deriveLearnProgress([attempt(false, 1), attempt(true, 2), attempt(true, 3)])).toEqual({ streak: 2, mastered: true });
  });
});

describe("createLearnRun", () => {
  it("de-duplicates, shuffles by run and caps at 50", () => {
    const run = createLearnRun(scope, [...ids(60), "item-1", ""], "guest");
    expect(run.itemIds).toHaveLength(LEARN_MAX_ITEMS);
    expect(new Set(run.itemIds).size).toBe(LEARN_MAX_ITEMS);
    expect(run.round.itemIds).toHaveLength(LEARN_ROUND_SIZE);
    expect(run.view).toBe("active");
    expect(run.completedAt).toBeNull();
    expect(createLearnRun(scope, ids(60), "guest").runId).not.toBe(run.runId);
  });
});

describe.each([1, 2, 3, 7, 8, 50])("a run over %i items", (count) => {
  it("fills rounds with min(7, unmastered) items and finishes with every item mastered", () => {
    const start = createLearnRun(scope, ids(count), "guest");
    // Miss every item once, then answer correctly twice in a row.
    const { run, rounds } = play(start, (_, attemptNumber) => attemptNumber > 1, (round, before) => {
      const unmastered = before.itemIds.filter((id) => !before.progress[id]?.mastered).length;
      expect(round.length).toBe(Math.min(LEARN_ROUND_SIZE, unmastered));
    });

    expect(run.view).toBe("finished");
    expect(run.completedAt).toBe(WHEN);
    expect(summarizeLearnRun(run)).toMatchObject({ total: count, mastered: count, firstTryCorrect: 0, isComplete: true });
    expect(rounds.every((round) => round.length <= LEARN_ROUND_SIZE)).toBe(true);
    expect(rounds.length).toBeGreaterThanOrEqual(Math.ceil(count / LEARN_ROUND_SIZE));
  });

  it("never starts a round with the item that ended the previous one when there are 2 or more items", () => {
    const start = createLearnRun(scope, ids(count), "guest");
    const { rounds } = play(start, (_, attemptNumber) => attemptNumber > 3);
    for (let index = 1; index < rounds.length; index += 1) {
      if (rounds[index].length >= 2) {
        expect(rounds[index][0]).not.toBe(rounds[index - 1][rounds[index - 1].length - 1]);
      }
    }
  });

  it("brings every attempted unmastered item back in every later round", () => {
    const start = createLearnRun(scope, ids(count), "guest");
    let previous: LearnRunState | null = null;
    play(start, (itemId, attemptNumber) => attemptNumber > 2 || itemId.endsWith("1") === false, (round, before) => {
      if (previous) {
        const owed = previous.round.itemIds.filter((id) => !before.progress[id]?.mastered);
        expect(owed.every((id) => round.includes(id))).toBe(true);
      }
      previous = before;
    });
  });

  it("masters every item in one round when all first attempts are correct", () => {
    const { run } = play(createLearnRun(scope, ids(count), "guest"), () => true);
    expect(summarizeLearnRun(run)).toMatchObject({ firstTryCorrect: count, missedItemIds: [], firstTryPercentage: 100 });
  });
});

describe("round composition", () => {
  it("puts attempted-but-unmastered items before unseen ones", () => {
    let run = createLearnRun(scope, ids(10), "guest");
    const missed = run.round.itemIds.slice(0, 3);
    run.round.itemIds.forEach((itemId) => {
      run = answer(run, !missed.includes(itemId));
      run = reduceLearnRun(run, { type: "advance" });
    });
    expect(run.view).toBe("recap");
    run = reduceLearnRun(run, { type: "next-round" });

    expect(run.round.number).toBe(2);
    // 3 misses come back, then the 3 items never shown in round 1.
    expect(run.round.itemIds).toHaveLength(6);
    expect(missed.every((id) => run.round.itemIds.includes(id))).toBe(true);
    const unseen = run.round.itemIds.filter((id) => !missed.includes(id));
    expect(unseen).toHaveLength(3);
    expect(unseen.every((id) => !run.progress[id])).toBe(true);
  });

  it("repeats a single remaining item in 1-item rounds", () => {
    let run = createLearnRun(scope, ids(1), "guest");
    run = reduceLearnRun(answer(run, false), { type: "advance" });
    expect(run.view).toBe("recap");
    run = reduceLearnRun(run, { type: "next-round" });
    expect(run.round.itemIds).toEqual(["item-1"]);
    run = reduceLearnRun(answer(run, true), { type: "advance" });
    run = reduceLearnRun(run, { type: "next-round" });
    run = answer(run, true);
    expect(run.completedAt).toBe(WHEN);
    expect(reduceLearnRun(run, { type: "advance" }).view).toBe("finished");
  });
});

describe("reducer guards", () => {
  it("accepts an answer only for the current item and only once per round", () => {
    const run = createLearnRun(scope, ids(3), "guest");
    const current = getCurrentLearnItemId(run)!;
    const other = run.round.itemIds[1];

    expect(reduceLearnRun(run, { type: "answer", itemId: other, selectedIndex: 0, isCorrect: true, completedAt: WHEN })).toBe(run);
    expect(reduceLearnRun(run, { type: "answer", itemId: "unknown", selectedIndex: 0, isCorrect: true, completedAt: WHEN })).toBe(run);

    const answered = answer(run, false);
    expect(answered).not.toBe(run);
    expect(getLearnAttemptInRound(answered, current)?.isCorrect).toBe(false);
    expect(answer(answered, true)).toBe(answered);
  });

  it("ignores advance until the current item is answered, and next-round outside the recap", () => {
    const run = createLearnRun(scope, ids(3), "guest");
    expect(reduceLearnRun(run, { type: "advance" })).toBe(run);
    expect(reduceLearnRun(run, { type: "next-round" })).toBe(run);

    const answered = answer(run, false);
    expect(reduceLearnRun(answered, { type: "next-round" })).toBe(answered);
    expect(reduceLearnRun(answered, { type: "advance" }).round.position).toBe(1);
  });

  it("shows feedback on the final mastering answer and goes straight to finish on Continue", () => {
    let run = createLearnRun(scope, ids(1), "guest");
    run = answer(run, true);
    expect(run.view).toBe("active");
    expect(run.completedAt).toBe(WHEN);
    expect(reduceLearnRun(run, { type: "next-round" })).toBe(run);
    expect(reduceLearnRun(run, { type: "advance" }).view).toBe("finished");
  });

  it("marks completion emitted only once a run is complete", () => {
    const run = createLearnRun(scope, ids(2), "guest");
    expect(reduceLearnRun(run, { type: "mark-completion-emitted" })).toBe(run);
    const { run: finished } = play(run, () => true);
    expect(reduceLearnRun(finished, { type: "mark-completion-emitted" }).completionEmitted).toBe(true);
  });
});

describe("toLearnCompletionSnapshot", () => {
  it("counts first-try correct out of the roster and lists first-try misses", () => {
    const start = createLearnRun(scope, ids(5), "guest");
    const missed = new Set(start.itemIds.slice(0, 2));
    const { run } = play(start, (itemId, attemptNumber) => attemptNumber > 1 || !missed.has(itemId));
    const snapshot = toLearnCompletionSnapshot(run)!;

    expect(snapshot.total).toBe(5);
    expect(snapshot.correct).toBe(3);
    expect(new Set(snapshot.missedItemIds)).toEqual(missed);
    expect(snapshot.missedItemIds.length).toBeLessThanOrEqual(snapshot.total - snapshot.correct);
    expect(snapshot.runId).toBe(run.runId);
    expect(snapshot.completedAt).toBe(WHEN);
  });

  it("is null until every item is mastered", () => {
    expect(toLearnCompletionSnapshot(createLearnRun(scope, ids(3), "guest"))).toBeNull();
  });
});

describe("options", () => {
  const item = {
    id: "item-1",
    question: "Q?",
    correctAnswer: "right",
    incorrectAnswers: ["w1", "w2", "w3"],
  } as ItemResponse;

  it("pins the Quiz option order (golden)", () => {
    expect(getQuizOptions(item, "run-golden")).toEqual(["w1", "w3", "right", "w2"]);
  });

  it("is stable for an attempt and re-seeded for the next one", () => {
    let run = createLearnRun(scope, ["item-1", "item-2"], "guest");
    const first = getLearnOptions(run, item);
    expect(getLearnOptions(run, item)).toEqual(first);
    expect(first).toEqual(getQuizOptions(item, `${run.runId}:1`));

    const target = getCurrentLearnItemId(run)!;
    const targetItem = { ...item, id: target };
    const before = getLearnOptions(run, targetItem);
    run = answer(run, false);
    // The shown order does not change after answering.
    expect(getLearnOptions(run, targetItem)).toEqual(before);

    run = reduceLearnRun(run, { type: "advance" });
    run = answer(run, true);
    run = reduceLearnRun(run, { type: "advance" });
    run = reduceLearnRun(run, { type: "next-round" });
    const second = run.round.itemIds.includes(target) ? getLearnOptions(run, targetItem) : null;
    if (second) expect(second).toEqual(getQuizOptions(targetItem, `${run.runId}:2`));
  });

  it("re-seeds each attempt number", () => {
    const orders = new Set(
      Array.from({ length: 8 }, (_, attempt) => getQuizOptions(item, `run-x:${attempt + 1}`).join("|")),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("restoreLearnRun", () => {
  function midRun(): LearnRunState {
    let run = createLearnRun(categoryScope, ids(9), "user:1");
    run = reduceLearnRun(answer(run, false), { type: "advance" });
    return reduceLearnRun(answer(run, true), { type: "advance" });
  }
  const roundTrip = (run: LearnRunState) => JSON.parse(JSON.stringify(run)) as unknown;

  it("restores a valid mid-run state", () => {
    const run = midRun();
    expect(restoreLearnRun(roundTrip(run), categoryScope, "user:1")).toEqual(run);
  });

  it("rejects other identities, scopes, schemas and non-objects", () => {
    const run = midRun();
    expect(restoreLearnRun(roundTrip(run), categoryScope, "guest")).toBeNull();
    expect(restoreLearnRun(roundTrip(run), { ...categoryScope, quizSize: 11 }, "user:1")).toBeNull();
    expect(restoreLearnRun({ ...(roundTrip(run) as object), schemaVersion: 2 }, categoryScope, "user:1")).toBeNull();
    expect(restoreLearnRun(null, categoryScope, "user:1")).toBeNull();
    expect(restoreLearnRun("x", categoryScope, "user:1")).toBeNull();
  });

  it("rejects progress that cannot have been produced", () => {
    const run = midRun();
    const mutate = (change: (copy: Record<string, any>) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const copy = roundTrip(run) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      change(copy);
      return restoreLearnRun(copy, categoryScope, "user:1");
    };
    const answeredId = Object.keys(run.progress)[0];

    expect(mutate((c) => { c.progress["not-in-roster"] = c.progress[answeredId]; })).toBeNull();
    expect(mutate((c) => { c.progress[answeredId].mastered = !c.progress[answeredId].mastered; })).toBeNull();
    expect(mutate((c) => { c.progress[answeredId].streak = 5; })).toBeNull();
    expect(mutate((c) => { c.progress[answeredId].attempts[0].answerFormat = "typed"; })).toBeNull();
    expect(mutate((c) => { c.progress[answeredId].attempts[0].selectedIndex = "right answer text"; })).toBeNull();
    expect(mutate((c) => { c.progress[answeredId].attempts[0].selectedIndex = 7; })).toBeNull();
    expect(mutate((c) => { c.progress[answeredId].attempts[0].selectedAnswer = "leak"; })).not.toBeNull();
    expect(mutate((c) => { c.progress[answeredId].attempts = []; })).toBeNull();
    expect(mutate((c) => { c.progress[answeredId].attempts[0].round = 9; })).toBeNull();
    expect(mutate((c) => { c.view = "finished"; })).toBeNull();
    expect(mutate((c) => { c.view = "recap"; })).toBeNull();
    expect(mutate((c) => { c.completionEmitted = true; })).toBeNull();
    expect(mutate((c) => { c.completedAt = WHEN; })).toBeNull();
    expect(mutate((c) => { c.round.position = 99; })).toBeNull();
    expect(mutate((c) => { c.round.itemIds = ["not-in-roster"]; })).toBeNull();
    expect(mutate((c) => { c.itemIds = c.itemIds.concat(c.itemIds[0]); })).toBeNull();
  });

  it("rejects a round that omits an unmastered attempted item or holds attempts for an item outside it", () => {
    let run = createLearnRun(categoryScope, ids(9), "user:1");
    const missed = run.round.itemIds[0];
    run = reduceLearnRun(answer(run, false), { type: "advance" });
    run.round.itemIds.slice(1).forEach(() => {
      run = reduceLearnRun(answer(run, true), { type: "advance" });
    });
    run = reduceLearnRun(run, { type: "next-round" });
    expect(run.round.itemIds).toContain(missed);
    expect(restoreLearnRun(roundTrip(run), categoryScope, "user:1")).toEqual(run);

    // Drop the owed item from the round (replace it with an unseen one).
    const unseen = run.itemIds.find((id) => !run.progress[id])!;
    const omitted = JSON.parse(JSON.stringify(run));
    omitted.round.itemIds = omitted.round.itemIds.map((id: string) => (id === missed ? unseen : id));
    expect(restoreLearnRun(omitted, categoryScope, "user:1")).toBeNull();

    // An attempt tagged with the current round for an item that is not in the round.
    const outsider = run.itemIds.find((id) => !run.round.itemIds.includes(id))!;
    const tagged = JSON.parse(JSON.stringify(run));
    tagged.progress[outsider] = { attempts: [{ round: run.round.number, selectedIndex: 0, isCorrect: false, answerFormat: "multiple-choice" }], streak: 0, mastered: false };
    expect(restoreLearnRun(tagged, categoryScope, "user:1")).toBeNull();
  });

  it("restores finished runs and rejects an unfinished run marked finished", () => {
    const { run } = play(createLearnRun(scope, ids(3), "guest"), () => true);
    expect(restoreLearnRun(roundTrip(run), scope, "guest")).toEqual(run);
    expect(restoreLearnRun({ ...(roundTrip(run) as object), completedAt: null }, scope, "guest")).toBeNull();
  });
});
