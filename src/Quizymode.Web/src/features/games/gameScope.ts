import { categoryNameToSlug } from "@/utils/categorySlug";
import { collectionNameToSlug } from "@/utils/collectionPath";

export type GameScope =
  | { kind: "topics"; topics: readonly string[]; search?: string }
  | { kind: "collection"; collectionId: string; collectionName?: string | null; search?: string }
  | {
      kind: "category";
      category: string;
      navigationKeywords: readonly string[];
      filterKeywords: readonly string[];
      search?: string;
    }
  | { kind: "global"; filterKeywords: readonly string[]; search?: string };

/** Identifies a scope for best times; the raw query string is not part of it. */
export function gameScopeKey(scope: GameScope): string {
  if (scope.kind === "topics") return `topics:${[...new Set(scope.topics)].sort().join(",")}`;
  if (scope.kind === "collection") return `collection:${scope.collectionId}`;
  if (scope.kind === "category") {
    return `category:${scope.category.toLowerCase()}|nav=${scope.navigationKeywords.join(",")}|kw=${scope.filterKeywords.join(",")}`;
  }
  return `global|kw=${scope.filterKeywords.join(",")}`;
}

/** `/games` (hub) or `/games/{gameId}` for the scope; the query string passes through as Learn's does. */
export function buildGamePath(scope: GameScope, gameId?: string): string {
  const base = gameId ? `/games/${gameId}` : "/games";
  const search = scope.search ?? "";
  if (scope.kind === "collection") {
    const slug = scope.collectionName ? `/${collectionNameToSlug(scope.collectionName)}` : "";
    return `${base}/collections/${scope.collectionId}${slug}${search}`;
  }
  if (scope.kind === "category") return `${base}/${categoryNameToSlug(scope.category)}${search}`;
  return `${base}${search}`;
}

/** Analytics context id: `{gameId}:collection:{guid}`, `{gameId}:category:{slug}` or `{gameId}:global` (never item text). */
export function gameContextId(gameId: string, scope: GameScope): string {
  if (scope.kind === "collection") return `${gameId}:collection:${scope.collectionId}`;
  if (scope.kind === "category") {
    const base = `${gameId}:category:${categoryNameToSlug(scope.category)}`;
    const refined = scope.navigationKeywords[0] ? `${base}:${scope.navigationKeywords[0]}` : base;
    return refined.length <= 100 ? refined : base;
  }
  if (scope.kind === "topics") {
    const paths = scope.topics.map(path => path.split("/"));
    const first = paths[0];
    if (first && paths.every(path => path[0] === first[0] && path[1] === first[1]))
      return gameContextId(gameId, { kind: "category", category: first[0], navigationKeywords: first.slice(1), filterKeywords: [] });
    return `${gameId}:topics`;
  }
  return `${gameId}:global`;
}
