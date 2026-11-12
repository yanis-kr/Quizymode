import type { ItemResponse } from "@/types/api";
import { categoryNameToSlug } from "@/utils/categorySlug";
import { isQuizPlayable, uniqueItemIds, TEST_MAX_QUESTIONS, type QuizRunMode } from "./quizRun";
import { itemFingerprint, type StoredResumeEntry } from "./resumeStorage";

/** Shown when a saved run cannot be resumed and a fresh run starts in its place (AC 3.6.24). */
export const RESUME_RECOVERY_NOTICE =
  "Some questions from your saved session changed or are no longer available, so a new run was started.";

export interface StudyUrlScope {
  collectionId?: string;
  categorySlug?: string;
  mode: QuizRunMode;
  navigationKeywords: readonly string[];
  filterKeywords: readonly string[];
  /** Explicit ?size from the URL, or null. */
  size: number | null;
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** True when the study page URL opens the saved run's scope and mode, so the page offers Resume or Start over. */
export function entryMatchesStudyUrl(entry: StoredResumeEntry, url: StudyUrlScope): boolean {
  const { scope, mode } = entry.run;
  if (mode !== url.mode) return false;
  if (scope.kind === "collection") {
    return !!url.collectionId && scope.collectionId.toLowerCase() === url.collectionId.toLowerCase();
  }
  if (url.collectionId) return false;
  if (url.size !== null && url.size !== scope.quizSize) return false;
  if (!sameList(scope.filterKeywords, url.filterKeywords)) return false;
  if (scope.kind === "global") return !url.categorySlug;
  return (
    !!url.categorySlug &&
    typeof scope.category === "string" &&
    categoryNameToSlug(scope.category).toLowerCase() === url.categorySlug.toLowerCase() &&
    sameList(scope.navigationKeywords, url.navigationKeywords)
  );
}

export interface ResumeFetchers {
  getById: (id: string) => Promise<ItemResponse>;
  getCollectionItems: (collectionId: string) => Promise<{ items: ItemResponse[] }>;
}

/** The sessionStorage snapshot (`navigationContext_quiz`) the quiz page restores from (AC 3.6.12). */
export interface QuizNavigationContext {
  mode: "quiz";
  category?: string;
  collectionId?: string;
  currentIndex: number;
  itemIds: string[];
  items?: ItemResponse[];
  quizRun: StoredResumeEntry["run"];
}

async function fetchAll(ids: string[], getById: ResumeFetchers["getById"], concurrency = 6): Promise<ItemResponse[]> {
  const results: ItemResponse[] = new Array(ids.length);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const index = next;
      next += 1;
      results[index] = await getById(ids[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return results;
}

/**
 * Refetches the saved run's questions as the current identity and checks they are all still readable, playable and
 * unchanged (same question, answer and distractors). Returns the snapshot to restore from, or null when the run
 * cannot be resumed (any request fails, a question changed, or a collection roster changed). Never throws.
 */
export async function prepareResume(
  entry: StoredResumeEntry,
  fetchers: ResumeFetchers,
): Promise<QuizNavigationContext | null> {
  const { run } = entry;
  try {
    let items: ItemResponse[];
    if (run.scope.kind === "collection") {
      const response = await fetchers.getCollectionItems(run.scope.collectionId);
      const seen = new Set<string>();
      const playable = (response.items ?? []).filter((item) => {
        if (!item.id || seen.has(item.id) || !isQuizPlayable(item)) return false;
        seen.add(item.id);
        return true;
      });
      items = run.mode === "test" ? playable.slice(0, TEST_MAX_QUESTIONS) : playable;
      const roster = uniqueItemIds(items);
      if (roster.length !== run.itemIds.length || !roster.every((id, index) => id === run.itemIds[index])) return null;
    } else {
      items = await fetchAll(run.itemIds, fetchers.getById);
      if (!items.every((item, index) => item && item.id === run.itemIds[index] && isQuizPlayable(item))) return null;
    }
    if (!items.every((item) => entry.fingerprints[item.id] === itemFingerprint(item))) return null;
    return {
      mode: "quiz",
      ...(run.scope.kind === "category" && run.scope.category ? { category: run.scope.category } : {}),
      ...(run.scope.kind === "collection" ? { collectionId: run.scope.collectionId } : {}),
      currentIndex: entry.currentIndex,
      itemIds: [...run.itemIds],
      ...(run.scope.kind === "collection" ? {} : { items }),
      quizRun: run,
    };
  } catch {
    return null;
  }
}
