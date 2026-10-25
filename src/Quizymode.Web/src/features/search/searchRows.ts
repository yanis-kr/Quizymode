import type { SearchGroups } from "@/api/search";
import { getResultPath, type SearchRowData } from "./searchResultLinks";
import type { SearchTab } from "./searchParams";

export type SearchGroupId = "topics" | "collections" | "questions" | "mine";

export interface SearchRow {
  id: string;
  groupId: SearchGroupId;
  data: SearchRowData;
  to: string;
}

export interface SearchGroupView {
  id: SearchGroupId;
  label: string;
  rows: SearchRow[];
  hasMore: boolean;
}

export const GROUP_LABELS: Record<SearchGroupId, string> = {
  topics: "Topics",
  collections: "Collections",
  questions: "Questions",
  mine: "Mine",
};

/** The tab a group's "See all" opens. */
export const GROUP_TABS: Record<SearchGroupId, SearchTab> = {
  topics: "topics",
  collections: "collections",
  questions: "questions",
  mine: "mine",
};

/** Topic rows keep at least this many categories before subcategories when a cap forces a trim. */
const TOPIC_CATEGORY_HEAD = 2;

function makeRow(groupId: SearchGroupId, index: number, data: SearchRowData): SearchRow {
  return { id: `${groupId}-${index}`, groupId, data, to: getResultPath(data) };
}

/**
 * Turns the API groups into the UI groups in display order (Topics, Collections, Questions, Mine), dropping empty
 * ones. Topics merge categories and subcategories; `topicCap` limits that merged group (null = no limit).
 */
export function buildGroupViews(groups: SearchGroups, topicCap: number | null): SearchGroupView[] {
  const views: SearchGroupView[] = [];

  const categories = groups.categories?.results ?? [];
  const subcategories = groups.subcategories?.results ?? [];
  const topicData: SearchRowData[] = [
    ...categories.slice(0, TOPIC_CATEGORY_HEAD).map((value): SearchRowData => ({ type: "category", value })),
    ...subcategories.map((value): SearchRowData => ({ type: "subcategory", value })),
    ...categories.slice(TOPIC_CATEGORY_HEAD).map((value): SearchRowData => ({ type: "category", value })),
  ];
  if (topicData.length > 0) {
    const capped = topicCap === null ? topicData : topicData.slice(0, topicCap);
    views.push({
      id: "topics",
      label: GROUP_LABELS.topics,
      rows: capped.map((data, index) => makeRow("topics", index, data)),
      hasMore:
        Boolean(groups.categories?.hasMore) || Boolean(groups.subcategories?.hasMore) || capped.length < topicData.length,
    });
  }

  const collections = groups.collections;
  if (collections && collections.results.length > 0) {
    views.push({
      id: "collections",
      label: GROUP_LABELS.collections,
      rows: collections.results.map((value, index) => makeRow("collections", index, { type: "collection", value })),
      hasMore: collections.hasMore,
    });
  }

  const items = groups.items;
  if (items && items.results.length > 0) {
    views.push({
      id: "questions",
      label: GROUP_LABELS.questions,
      rows: items.results.map((value, index) => makeRow("questions", index, { type: "question", value })),
      hasMore: items.hasMore,
    });
  }

  const mine = groups.mine;
  if (mine && mine.results.length > 0) {
    views.push({
      id: "mine",
      label: GROUP_LABELS.mine,
      rows: mine.results.map((value, index) => makeRow("mine", index, { type: "mine", value })),
      hasMore: mine.hasMore,
    });
  }

  return views;
}

export function countRows(views: SearchGroupView[]): number {
  return views.reduce((sum, view) => sum + view.rows.length, 0);
}
