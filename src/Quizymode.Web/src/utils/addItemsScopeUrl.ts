/**
 * Helpers for `/items/add` query params: category + keywords (rank1, rank2, optional extras).
 */

/** Merge path navigation keywords + query filter keywords (dedupe case-insensitive; path order first). */
export function mergeKeywordsForAddItemsUrl(pathKws: string[], queryKws: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of pathKws) {
    const t = k.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
  }
  for (const k of queryKws) {
    const t = k.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
  }
  return out;
}

export function buildAddItemsPathWithParams(
  categoryName: string | null | undefined,
  pathKws: string[],
  queryKws: string[]
): string {
  const params = new URLSearchParams();
  if (categoryName?.trim()) params.set("category", categoryName.trim());
  const merged = mergeKeywordsForAddItemsUrl(pathKws, queryKws);
  if (merged.length > 0) params.set("keywords", merged.join(","));
  const qs = params.toString();
  return qs ? `/items/add?${qs}` : "/items/add";
}

/** Build `keywords` query value: rank1, rank2, then comma-split extras. */
export function keywordsParamFromScope(
  rank1: string,
  rank2: string,
  extrasCommaSeparated: string
): string | undefined {
  const extras = extrasCommaSeparated.split(",").map((s) => s.trim()).filter(Boolean);
  const parts = [rank1.trim(), rank2.trim(), ...extras].filter(Boolean);
  return parts.length > 0 ? parts.join(",") : undefined;
}

export function parseKeywordsParam(keywordsParam: string | null): {
  rank1: string;
  rank2: string;
  extrasJoined: string;
} {
  const parts = keywordsParam
    ? keywordsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return {
    rank1: parts[0] ?? "",
    rank2: parts[1] ?? "",
    extrasJoined: parts.slice(2).join(", "),
  };
}
