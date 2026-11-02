import { categoryNameToSlug } from "@/utils/categorySlug";
import { buildCollectionStudyPath } from "@/utils/collectionPath";
import type { QuizRunScope } from "./quizRun";

export type ResultShareKind = "collection" | "category" | "global" | "daily";

/** What a quiz result share carries: the text, an optional link and whether a private collection was withheld. */
export interface ResultShareDescriptor {
  kind: ResultShareKind;
  text: string;
  url?: string;
  /** True when the result belongs to a collection that is not known to be public: only the score is shared. */
  isPrivateCollection?: boolean;
}

export interface ScoreTier {
  /** The rounded percentage band. */
  id: "perfect" | "great" | "good" | "practice";
  label: string;
}

/** The results heading tier (AC 3.19.1); no tier for an empty run. */
export function scoreTier(percentage: number, total: number): ScoreTier | null {
  if (total <= 0) return null;
  if (percentage >= 100) return { id: "perfect", label: "Perfect score!" };
  if (percentage >= 80) return { id: "great", label: "Great job!" };
  if (percentage >= 50) return { id: "good", label: "Good effort. Keep going!" };
  return { id: "practice", label: "Keep practicing. Every miss is a lesson." };
}

function withUtm(base: string, kind: ResultShareKind): string {
  return `${base}?utm_source=share&utm_medium=share&utm_campaign=quiz_result&utm_content=${kind}`;
}

export function buildCollectionShare(args: {
  correct: number;
  total: number;
  collection: { id: string; name: string; isPublic?: boolean } | null | undefined;
  origin: string;
}): ResultShareDescriptor {
  const { correct, total, collection, origin } = args;
  // Fail closed: anything but a collection known to be public shares the score only.
  if (!collection || collection.isPublic !== true) {
    return { kind: "collection", text: `I scored ${correct}/${total} on a Quizymode quiz.`, isPrivateCollection: true };
  }
  return {
    kind: "collection",
    text: `I scored ${correct}/${total} on "${collection.name}" on Quizymode. Can you beat me?`,
    url: withUtm(`${origin}${buildCollectionStudyPath("quiz", collection.id, collection.name)}`, "collection"),
  };
}

export function buildCategoryShare(args: { correct: number; total: number; category: string; origin: string }): ResultShareDescriptor {
  const { correct, total, category, origin } = args;
  return {
    kind: "category",
    text: `I scored ${correct}/${total} on a ${category} quiz on Quizymode. Try this quiz!`,
    url: withUtm(`${origin}/quiz/${categoryNameToSlug(category)}`, "category"),
  };
}

export function buildGlobalShare(args: { correct: number; total: number; origin: string }): ResultShareDescriptor {
  const { correct, total, origin } = args;
  return {
    kind: "global",
    text: `I scored ${correct}/${total} on a Quizymode quiz. Try this quiz!`,
    url: withUtm(`${origin}/quiz`, "global"),
  };
}

/** Wordle-style grid: one square per question in roster order, with no question text. */
export function buildDailyShare(args: { date: string; results: Array<boolean | null>; origin: string }): ResultShareDescriptor {
  const { date, results, origin } = args;
  const correct = results.filter((result) => result === true).length;
  // null marks a question skipped for an unavailable picture (#403): a grey square, outside the score.
  const grid = results.map((result) => (result === null ? "\u2B1C" : result ? "\u{1F7E9}" : "\u{1F7E5}")).join("");
  return {
    kind: "daily",
    text: `Quizymode Daily ${date} ${correct}/${results.filter((result) => result !== null).length}\n${grid}`,
    url: withUtm(`${origin}/daily`, "daily"),
  };
}

/** The descriptor for a main-quiz run, chosen from its scope. */
export function buildRunShare(args: {
  scope: QuizRunScope;
  correct: number;
  total: number;
  collection: { id: string; name: string; isPublic?: boolean } | null | undefined;
  origin: string;
}): ResultShareDescriptor {
  const { scope, correct, total, collection, origin } = args;
  if (scope.kind === "collection") return buildCollectionShare({ correct, total, collection, origin });
  if (scope.kind === "category" && scope.category) {
    return buildCategoryShare({ correct, total, category: scope.category, origin });
  }
  return buildGlobalShare({ correct, total, origin });
}

/** The full text copied and previewed: the text, then the link on its own line. */
export function shareCopyText(descriptor: ResultShareDescriptor): string {
  return descriptor.url ? `${descriptor.text}\n${descriptor.url}` : descriptor.text;
}
