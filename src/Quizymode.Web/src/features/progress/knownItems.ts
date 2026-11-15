import type { QuizCompletionSnapshot } from "@/features/items/quiz/quizRun";
import { categoryNameToSlug } from "@/utils/categorySlug";

/**
 * Browser-local "known" items per set for anonymous visitors (#672). An item is known once it was answered correctly
 * in a completed quiz; a later wrong answer removes it. Stored separately from `quizymode.guest.v1` and never sent
 * to the server. A set key is the category slug plus its navigation keywords (a quiz on a leaf also counts toward
 * every enclosing set) or a collection ID.
 */
export const KNOWN_ITEMS_STORAGE_KEY = "quizymode.known.v1";
export const KNOWN_ITEMS_CHANGED_EVENT = "quizymode:known-items-changed";
const MAX_SETS = 60;
const MAX_IDS_PER_SET = 1000;
const MAX_DOCUMENT_LENGTH = 512 * 1024;

export type KnownItemsDocument = Record<string, string[]>;

export function categorySetKey(categorySlug: string, navigationKeywords: readonly string[]): string {
  return ["s", categorySlug, ...navigationKeywords].map((part) => part.trim().toLowerCase()).join("/");
}

export function collectionSetKey(collectionId: string): string {
  return `c/${collectionId.trim().toLowerCase()}`;
}

function setKeysForSnapshot(snapshot: QuizCompletionSnapshot): string[] {
  const scope = snapshot.scope;
  if (scope.kind === "collection") return [collectionSetKey(scope.collectionId)];
  if (scope.kind !== "category" || !scope.category) return [];
  const slug = categoryNameToSlug(scope.category);
  if (!slug) return [];
  const keys: string[] = [];
  for (let depth = 0; depth <= scope.navigationKeywords.length; depth++) {
    keys.push(categorySetKey(slug, scope.navigationKeywords.slice(0, depth)));
  }
  return keys;
}

function readDocument(): KnownItemsDocument {
  try {
    const raw = window.localStorage.getItem(KNOWN_ITEMS_STORAGE_KEY);
    if (!raw || raw.length > MAX_DOCUMENT_LENGTH) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: KnownItemsDocument = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>).slice(0, MAX_SETS)) {
      if (!Array.isArray(value)) continue;
      result[key] = Array.from(new Set(value.filter((id): id is string => typeof id === "string"))).slice(
        0,
        MAX_IDS_PER_SET,
      );
    }
    return result;
  } catch {
    return {};
  }
}

/** Number of known items stored for a set. Never throws. */
export function readKnownCount(setKey: string): number {
  return readDocument()[setKey]?.length ?? 0;
}

/**
 * Applies a completed quiz: correct answers become known, wrong answers stop being known. Only for anonymous runs
 * (the caller checks eligibility); storage failures are swallowed.
 */
export function recordKnownItems(snapshot: QuizCompletionSnapshot): void {
  const correct = snapshot.correctItemIds ?? [];
  const missed = new Set(snapshot.missedItemIds);
  if (correct.length === 0 && missed.size === 0) return;
  const keys = setKeysForSnapshot(snapshot);
  if (keys.length === 0) return;
  try {
    const doc = readDocument();
    for (const key of keys) {
      const ids = new Set((doc[key] ?? []).filter((id) => !missed.has(id)));
      for (const id of correct) ids.add(id);
      delete doc[key];
      doc[key] = Array.from(ids).slice(-MAX_IDS_PER_SET);
    }
    const entries = Object.entries(doc).slice(-MAX_SETS);
    window.localStorage.setItem(KNOWN_ITEMS_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
    window.dispatchEvent(new Event(KNOWN_ITEMS_CHANGED_EVENT));
  } catch {
    // Progress is a convenience; a storage failure must never break a quiz.
  }
}
