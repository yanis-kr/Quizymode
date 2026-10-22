import type { ItemResponse } from "@/types/api";

export type FlashcardGrade = "got-it" | "still-learning";

export type FlashcardGrades = Readonly<Record<string, FlashcardGrade>>;

/**
 * Shuffles ids with Fisher-Yates and puts `anchorId` first when it is in the deck, so a deep link or the
 * card being studied stays on screen. `random` is injected so the order is deterministic in tests.
 */
export function shuffleWithAnchor(ids: readonly string[], anchorId: string | null | undefined, random: () => number): string[] {
  const rest = ids.filter((id) => id !== anchorId);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return anchorId && ids.includes(anchorId) ? [anchorId, ...rest] : rest;
}

/** The deck order with `anchorId` moved to the front (no shuffling). */
export function anchorFirst(ids: readonly string[], anchorId: string | null | undefined): string[] {
  return anchorId && ids.includes(anchorId) ? [anchorId, ...ids.filter((id) => id !== anchorId)] : [...ids];
}

/** The still-learning cards of a round, in deck order. */
export function pileInDeckOrder<T extends Pick<ItemResponse, "id">>(deck: readonly T[], grades: FlashcardGrades): T[] {
  return deck.filter((item) => grades[item.id] === "still-learning");
}

export interface FlashcardSummaryCounts {
  gotIt: number;
  stillLearning: number;
  notGraded: number;
}

/** Per-round counts over the cards in the round's deck. */
export function summaryCounts(deck: readonly Pick<ItemResponse, "id">[], grades: FlashcardGrades): FlashcardSummaryCounts {
  let gotIt = 0;
  let stillLearning = 0;
  for (const item of deck) {
    if (grades[item.id] === "got-it") gotIt += 1;
    else if (grades[item.id] === "still-learning") stillLearning += 1;
  }
  return { gotIt, stillLearning, notGraded: deck.length - gotIt - stillLearning };
}
