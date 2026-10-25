import { z } from "zod";
import type { SearchType } from "@/api/search";

export const SEARCH_TABS = ["all", "topics", "collections", "questions", "mine"] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
/** Results per group in the header dropdown and on the All tab (review resolution 7). */
export const GROUP_PREVIEW_LIMIT = 5;
/** Results per page on a single-type tab. */
export const TAB_PAGE_SIZE = 20;
/** The API rejects offsets above 200, so the last reachable page is 11 (offset 200). */
export const MAX_SEARCH_OFFSET = 200;
export const MAX_SEARCH_PAGE = MAX_SEARCH_OFFSET / TAB_PAGE_SIZE + 1;

const searchParamsSchema = z.object({
  q: z
    .string()
    .catch("")
    .transform((value) => value.trimStart().slice(0, MAX_QUERY_LENGTH)),
  tab: z.enum(SEARCH_TABS).catch("all"),
  page: z.coerce.number().int().min(1).max(MAX_SEARCH_PAGE).catch(1),
});

export interface ParsedSearchParams {
  q: string;
  tab: SearchTab;
  page: number;
}

/**
 * Reads /search?q=&tab=&page=. The URL is the single source of truth: an invalid tab becomes "all", "mine" for an
 * anonymous visitor becomes "all", and page is ignored on the All tab.
 */
export function parseSearchParams(params: URLSearchParams, signedIn: boolean): ParsedSearchParams {
  const parsed = searchParamsSchema.parse({
    q: params.get("q") ?? undefined,
    tab: params.get("tab") ?? undefined,
    page: params.get("page") ?? undefined,
  });
  const tab: SearchTab = parsed.tab === "mine" && !signedIn ? "all" : parsed.tab;
  return { q: parsed.q, tab, page: tab === "all" ? 1 : parsed.page };
}

export function buildSearchUrl({ q, tab = "all", page = 1 }: { q: string; tab?: SearchTab; page?: number }): string {
  const params = new URLSearchParams();
  params.set("q", q);
  if (tab !== "all") {
    params.set("tab", tab);
    if (page > 1) {
      params.set("page", String(page));
    }
  }
  return `/search?${params.toString()}`;
}

/** The API `types` for a tab. `mine` is only requested for signed-in visitors. */
export function tabSearchTypes(tab: SearchTab, signedIn: boolean): SearchType[] {
  switch (tab) {
    case "topics":
      return ["categories", "subcategories"];
    case "collections":
      return ["collections"];
    case "questions":
      return ["items"];
    case "mine":
      return ["mine"];
    default:
      return signedIn
        ? ["categories", "subcategories", "collections", "items", "mine"]
        : ["categories", "subcategories", "collections", "items"];
  }
}
