import { GROUP_TABS, type SearchGroupId, type SearchGroupView, type SearchRow } from "./searchRows";
import type { SearchTab } from "./searchParams";

export type SearchOption =
  | { id: string; kind: "row"; row: SearchRow; position: number }
  | { id: string; kind: "seeAll"; groupId: SearchGroupId; tab: SearchTab }
  | { id: string; kind: "all" }
  | { id: string; kind: "retry" };

export const ALL_OPTION_ID = "gs-opt-all";
export const RETRY_OPTION_ID = "gs-opt-retry";

export interface SearchOptionGroup {
  view: SearchGroupView;
  rows: Extract<SearchOption, { kind: "row" }>[];
  seeAll: Extract<SearchOption, { kind: "seeAll" }> | null;
}

export interface SearchOptionModel {
  groups: SearchOptionGroup[];
  /** The closing "See all results" option; null when there is nothing to list. */
  all: SearchOption | null;
  /** Every option in keyboard order. */
  flat: SearchOption[];
}

/**
 * Orders the dropdown for the keyboard: each group's rows, its "See all" footer when it has more (Mine has none),
 * then the final "See all results for ..." option. Positions are 1-based across all rows (analytics `position`).
 */
export function buildOptionModel(views: SearchGroupView[], includeAll: boolean): SearchOptionModel {
  let position = 0;
  const groups: SearchOptionGroup[] = views.map((view) => ({
    view,
    rows: view.rows.map((row) => {
      position += 1;
      return { id: `gs-opt-${row.id}`, kind: "row" as const, row, position };
    }),
    seeAll:
      view.hasMore && view.id !== "mine"
        ? { id: `gs-opt-${view.id}-all`, kind: "seeAll" as const, groupId: view.id, tab: GROUP_TABS[view.id] }
        : null,
  }));

  const all: SearchOption | null = includeAll && groups.length > 0 ? { id: ALL_OPTION_ID, kind: "all" } : null;
  const flat: SearchOption[] = [
    ...groups.flatMap((group) => (group.seeAll ? [...group.rows, group.seeAll] : group.rows)),
    ...(all ? [all] : []),
  ];

  return { groups, all, flat };
}
