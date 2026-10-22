import { summarizeQuizRun, type QuizRunState } from "../quizRun";

export type TestPaletteResult = "correct" | "incorrect" | "unanswered";

export interface TestPaletteEntry {
  itemId: string;
  /** 1-based roster position. */
  position: number;
  answered: boolean;
  flagged: boolean;
  current: boolean;
  /** Set after submit. */
  result?: TestPaletteResult;
}

export interface TestPalette {
  entries: TestPaletteEntry[];
  answered: number;
  unanswered: number;
  flagged: number;
}

/** Pure selector behind the question palette and the Submit confirmation counts (AC 3.18.4, 3.18.5). */
export function getTestPalette(run: QuizRunState, currentIndex: number): TestPalette {
  const submitted = run.submittedAt !== null;
  const flagged = new Set(run.flagged);
  const entries = run.itemIds.map((itemId, index): TestPaletteEntry => {
    const outcome = run.outcomes[itemId];
    const entry: TestPaletteEntry = {
      itemId,
      position: index + 1,
      answered: Boolean(outcome),
      flagged: flagged.has(itemId),
      current: index === currentIndex,
    };
    if (submitted) entry.result = outcome ? (outcome.isCorrect ? "correct" : "incorrect") : "unanswered";
    return entry;
  });
  const answered = summarizeQuizRun(run).answered;
  return { entries, answered, unanswered: run.itemIds.length - answered, flagged: run.flagged.length };
}

/** Screen-reader name, for example "Question 7, answered, flagged, current". */
export function paletteEntryLabel(entry: TestPaletteEntry): string {
  const parts = [`Question ${entry.position}`, entry.answered ? "answered" : "unanswered"];
  if (entry.flagged) parts.push("flagged");
  if (entry.current) parts.push("current");
  return parts.join(", ");
}
