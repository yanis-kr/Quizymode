import type { StarterPoolEntry } from "@/api/starter";

/** One answerable question for the About hook (#884). */
export interface HookQuestion {
  id: string;
  question: string;
  correctAnswer: string;
  options: string[];
  explanation: string;
  source: string;
}

/**
 * Used when the pool request fails, is empty or has no usable entry (AC-A4). Same question as the starter pool's Saturn
 * entry; the claim was checked on 2026-11-26 against NASA's Saturn facts page, which says Saturn is the only planet with
 * an average density less than water and could float in a bathtub.
 */
export const FALLBACK_HOOK_QUESTION: HookQuestion = {
  id: "about-hook-fallback-saturn",
  question: "Which planet is less dense than water, so it would float in a giant bathtub?",
  correctAnswer: "Saturn",
  options: ["Saturn", "Neptune", "Jupiter", "Mars"],
  explanation: "Saturn is mostly hydrogen and helium, so its average density is lower than water's.",
  source: "https://science.nasa.gov/saturn/facts/",
};

function httpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Text-only, 2 to 4 options, with a source URL (AC-A3b). A picture question has `questionImage` (AC 1.14.4). */
export function isUsableHookEntry(entry: StarterPoolEntry): boolean {
  const { item } = entry;
  if (item.questionImage) return false;
  const optionCount = 1 + item.incorrectAnswers.length;
  if (optionCount < 2 || optionCount > 4) return false;
  if (new Set([item.correctAnswer, ...item.incorrectAnswers]).size !== optionCount) return false;
  return httpUrl(item.source) !== null && item.question.trim().length > 0;
}

export function toHookQuestion(entry: StarterPoolEntry): HookQuestion {
  const { item } = entry;
  return {
    id: item.id,
    question: item.question,
    correctAnswer: item.correctAnswer,
    options: [item.correctAnswer, ...item.incorrectAnswers],
    explanation: entry.wowLine.trim() || item.explanation || "",
    source: httpUrl(item.source) ?? "",
  };
}

/** Usable pool questions, or the static fallback when there are none. */
export function hookQuestionsFrom(entries: StarterPoolEntry[] | undefined): HookQuestion[] {
  const usable = (entries ?? []).filter(isUsableHookEntry).map(toHookQuestion);
  return usable.length > 0 ? usable : [FALLBACK_HOOK_QUESTION];
}

/** Picks an index in [0, count) from a seed in [0, 1). */
export function seededIndex(seed: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(seed * count)));
}

/** Deterministic shuffle so a re-render keeps the option order (mulberry32 from the seed). */
export function shuffleOptions(options: string[], seed: number): string[] {
  let state = Math.floor(seed * 0xffffffff) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...options];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A different question than `currentId` (never the same twice in a row), or null when there is no other. */
export function pickAnotherId(questions: HookQuestion[], currentId: string, seed: number): string | null {
  const others = questions.filter((question) => question.id !== currentId);
  if (others.length === 0) return null;
  return others[seededIndex(seed, others.length)].id;
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
