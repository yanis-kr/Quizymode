import type {
  SearchCategoryResult,
  SearchCollectionResult,
  SearchItemResult,
  SearchMineResult,
  SearchSubcategoryResult,
} from "@/api/search";
import type { AnalyticsContextType } from "@/features/analytics/analyticsEvents";
import { buildCategoryPath } from "@/utils/categorySlug";
import { buildCollectionPath } from "@/utils/collectionPath";

export type SearchRowData =
  | { type: "category"; value: SearchCategoryResult }
  | { type: "subcategory"; value: SearchSubcategoryResult }
  | { type: "collection"; value: SearchCollectionResult }
  | { type: "question"; value: SearchItemResult }
  | { type: "mine"; value: SearchMineResult };

/** The route a result opens. */
export function getResultPath(row: SearchRowData): string {
  switch (row.type) {
    case "category":
      return `/categories/${encodeURIComponent(row.value.slug)}`;
    case "subcategory": {
      const { categorySlug, l1, l2 } = row.value;
      return buildCategoryPath(categorySlug, l2 ? [l1, l2] : [l1]);
    }
    case "collection":
      return buildCollectionPath(row.value.id, row.value.name);
    case "question":
      return `/items/${row.value.id}`;
    case "mine":
      switch (row.value.kind) {
        case "collection":
          return buildCollectionPath(row.value.id, row.value.title);
        case "studyGuideDocument":
          return `/study-guides/documents/${row.value.id}`;
        default:
          return `/items/${row.value.id}`;
      }
  }
}

/**
 * Analytics context for a clicked result. Only public targets carry an id (AC 5.4.11); the caller's own
 * content is reported as `mine` with no id.
 */
export function getResultAnalyticsContext(row: SearchRowData): { contextType: AnalyticsContextType; contextId?: string } {
  switch (row.type) {
    case "category":
      return { contextType: "category", contextId: row.value.slug };
    case "subcategory":
      return { contextType: "category", contextId: row.value.categorySlug };
    case "collection":
      return { contextType: "collection", contextId: row.value.id };
    case "question":
      return { contextType: "item", contextId: row.value.id };
    case "mine":
      return { contextType: "mine" };
  }
}
