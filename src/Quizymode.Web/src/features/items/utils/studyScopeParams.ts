function parseKeywordList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

export function getStudyScopeKeywords(
  searchParams: URLSearchParams,
  hasCategoryScope: boolean
): {
  keywords: string[];
  navigationKeywords: string[];
  filterKeywords: string[];
} {
  const keywords = parseKeywordList(searchParams.get("keywords"));

  if (!hasCategoryScope) {
    return {
      keywords,
      navigationKeywords: [],
      filterKeywords: keywords,
    };
  }

  const navigationKeywords = searchParams.has("nav")
    ? parseKeywordList(searchParams.get("nav"))
    : keywords;
  const navigationKeywordSet = new Set(
    navigationKeywords.map((keyword) => keyword.toLowerCase())
  );
  const filterKeywords = keywords.filter(
    (keyword) => !navigationKeywordSet.has(keyword.toLowerCase())
  );

  return {
    keywords,
    navigationKeywords,
    filterKeywords,
  };
}
