import { seededShuffle } from "@/features/items/learn/learnRun";
import type { ItemResponse } from "@/types/api";
import { GAME_MAX_ANSWER_CHARS } from "../gameRoster";

export const SORT_IT_MAX_LABEL_CHARS = 30;
export const SORT_IT_MIN_GROUPS = 2;
export const SORT_IT_MAX_GROUPS = 4;
export const SORT_IT_MIN_PER_GROUP = 4;

export interface SortItGroup {
  /** Trimmed, whitespace-collapsed, lowercase label. */
  key: string;
  /** The first spelling seen, trimmed. */
  label: string;
  items: ItemResponse[];
}

/** Trim, collapse inner whitespace, lowercase: the identity of a label or an answer. */
function normalizeKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Every group that can be played from the raw roster (AC 3.20.22), before the per-run pick of 4.
 * Order: eligibility, id dedupe, drop answers that sit in more than one group or equal a group label,
 * dedupe answers within a group (first wins), keep groups with at least 4 items; fewer than 2 groups gives none.
 * The question is never shown, so it has no length rule and is not deduplicated.
 */
export function buildSortItGroups(items: readonly ItemResponse[]): SortItGroup[] {
  const ids = new Set<string>();
  const eligible: { item: ItemResponse; groupKey: string; label: string; answerKey: string }[] = [];
  for (const item of items) {
    const label: string = (item.groupLabel ?? "").trim();
    const answer: string = (item.correctAnswer ?? "").trim();
    if (!item.id || ids.has(item.id)) continue;
    if (label.length < 1 || label.length > SORT_IT_MAX_LABEL_CHARS) continue;
    if (answer.length < 1 || answer.length > GAME_MAX_ANSWER_CHARS) continue;
    ids.add(item.id);
    eligible.push({ item, groupKey: normalizeKey(label), label, answerKey: normalizeKey(answer) });
  }

  const groupsByAnswer = new Map<string, Set<string>>();
  const labelKeys = new Set<string>();
  for (const entry of eligible) {
    labelKeys.add(entry.groupKey);
    const groupKeys: Set<string> = groupsByAnswer.get(entry.answerKey) ?? new Set<string>();
    groupKeys.add(entry.groupKey);
    groupsByAnswer.set(entry.answerKey, groupKeys);
  }

  const groups = new Map<string, SortItGroup>();
  const answersInGroup = new Set<string>();
  for (const entry of eligible) {
    if ((groupsByAnswer.get(entry.answerKey)?.size ?? 0) > 1 || labelKeys.has(entry.answerKey)) continue;
    const seenKey = `${entry.groupKey}\u0000${entry.answerKey}`;
    if (answersInGroup.has(seenKey)) continue;
    answersInGroup.add(seenKey);
    const group: SortItGroup = groups.get(entry.groupKey) ?? { key: entry.groupKey, label: entry.label, items: [] };
    group.items.push(entry.item);
    groups.set(entry.groupKey, group);
  }

  const qualifying: SortItGroup[] = [...groups.values()].filter((group) => group.items.length >= SORT_IT_MIN_PER_GROUP);
  return qualifying.length >= SORT_IT_MIN_GROUPS ? qualifying : [];
}

export function hasSortableSet(items: readonly ItemResponse[]): boolean {
  return buildSortItGroups(items).length >= SORT_IT_MIN_GROUPS;
}

/** Up to 4 groups for a run; with more qualifying groups the pick is seeded by the run id. */
export function pickSortItGroups(groups: readonly SortItGroup[], runId: string): SortItGroup[] {
  if (groups.length <= SORT_IT_MAX_GROUPS) return [...groups];
  return seededShuffle(groups, `${runId}:groups`).slice(0, SORT_IT_MAX_GROUPS);
}
