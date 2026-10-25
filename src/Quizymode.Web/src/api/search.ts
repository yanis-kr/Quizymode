import { isAxiosError } from "axios";
import { apiClient } from "./client";

/** Group names accepted by GET /search `types` (AC 11.2). */
export type SearchType = "categories" | "subcategories" | "collections" | "items" | "mine";

export interface SearchGroup<T> {
  results: T[];
  hasMore: boolean;
}

export interface SearchCategoryResult {
  slug: string;
  name: string;
  description: string | null;
  itemCount: number;
}

export interface SearchSubcategoryResult {
  categorySlug: string;
  l1: string;
  l2: string | null;
  description: string | null;
  itemCount: number;
}

export interface SearchCollectionResult {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
}

/** `start` and `length` are UTF-16 code unit indices into `text`, the same indexing JavaScript strings use. */
export interface SearchHighlight {
  start: number;
  length: number;
}

export interface SearchSnippet {
  text: string;
  highlights: SearchHighlight[];
}

export interface SearchItemResult {
  id: string;
  snippet: SearchSnippet;
  categorySlug: string | null;
  l1: string | null;
  l2: string | null;
}

export type SearchMineKind = "collection" | "studyGuideDocument" | "item";

export interface SearchMineResult {
  kind: SearchMineKind;
  id: string;
  title: string;
}

/** A group is null when it was not requested or is not permitted (`mine` for anonymous callers). */
export interface SearchGroups {
  categories: SearchGroup<SearchCategoryResult> | null;
  subcategories: SearchGroup<SearchSubcategoryResult> | null;
  collections: SearchGroup<SearchCollectionResult> | null;
  items: SearchGroup<SearchItemResult> | null;
  mine: SearchGroup<SearchMineResult> | null;
}

export interface SearchResponse {
  query: string;
  groups: SearchGroups;
}

export interface SearchParams {
  q: string;
  types: SearchType[];
  limit: number;
  offset: number;
}

export const searchApi = {
  /** Pass the TanStack Query `signal` so a superseded request is cancelled. */
  search: async (params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> => {
    const { data } = await apiClient.get<SearchResponse>("/search", {
      params: {
        q: params.q,
        types: params.types.join(","),
        limit: params.limit,
        offset: params.offset,
      },
      signal,
    });
    return data;
  },
};

/** Set when the failure was a 429; `retryAfterSeconds` is null when the header is absent or unreadable. */
export interface SearchRateLimit {
  retryAfterSeconds: number | null;
}

export function getSearchRateLimit(error: unknown): SearchRateLimit | null {
  if (!isAxiosError(error) || error.response?.status !== 429) {
    return null;
  }

  const raw: unknown = error.response.headers?.["retry-after"];
  const seconds = typeof raw === "string" || typeof raw === "number" ? Number.parseInt(String(raw), 10) : Number.NaN;
  return { retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null };
}
