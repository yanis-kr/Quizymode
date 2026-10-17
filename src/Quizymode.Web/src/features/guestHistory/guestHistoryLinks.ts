import { buildCollectionPath, buildCollectionStudyPath } from "@/utils/collectionPath";
import { buildCategoryPath, categorySlugToName } from "@/utils/categorySlug";
import type { GuestHistorySource } from "./guestHistoryStorage";

/** Builds a quiz route for a validated stored source using app route helpers; stored URLs are never used. */
export function buildGuestPracticePath(source: GuestHistorySource): string {
  if (source.kind === "collection") {
    return buildCollectionStudyPath("quiz", source.collectionId);
  }
  const params = new URLSearchParams();
  if (source.kind === "category") {
    if (source.navigationKeywords.length > 0) params.set("nav", source.navigationKeywords.join(","));
    const keywords = [...source.navigationKeywords, ...source.filterKeywords];
    if (keywords.length > 0) params.set("keywords", keywords.join(","));
    const search = params.toString();
    return `/quiz/${encodeURIComponent(source.categorySlug)}${search ? `?${search}` : ""}`;
  }
  if (source.filterKeywords.length > 0) params.set("keywords", source.filterKeywords.join(","));
  const search = params.toString();
  return `/quiz${search ? `?${search}` : ""}`;
}

export function buildGuestBrowsePath(source: GuestHistorySource, collectionName?: string | null): string {
  if (source.kind === "collection") return buildCollectionPath(source.collectionId, collectionName);
  if (source.kind === "category") return buildCategoryPath(source.categorySlug, source.navigationKeywords);
  return "/categories";
}

export function describeGuestTopic(source: Exclude<GuestHistorySource, { kind: "collection" }>): string {
  if (source.kind === "global") return "All categories";
  return [categorySlugToName(source.categorySlug), ...source.navigationKeywords].join(" › ");
}
