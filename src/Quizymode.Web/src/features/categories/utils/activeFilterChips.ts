export interface ActiveFilterChip {
  kind: "nav" | "tag";
  /** Keyword slug as it appears in the URL. */
  keyword: string;
  /** Position inside the path keywords (nav chips) or tag keywords (tag chips). */
  index: number;
}

export interface ActiveFilterState {
  pathKeywords: string[];
  tagKeywords: string[];
}

/** Path keywords first (navigation), then tag keywords that are not already in the path (case-insensitive). */
export function buildActiveFilterChips(
  pathKeywords: string[],
  tagKeywords: string[]
): ActiveFilterChip[] {
  const seen = new Set<string>();
  const chips: ActiveFilterChip[] = [];
  pathKeywords.forEach((keyword, index) => {
    const lower = keyword.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    chips.push({ kind: "nav", keyword, index });
  });
  tagKeywords.forEach((keyword, index) => {
    const lower = keyword.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    chips.push({ kind: "tag", keyword, index });
  });
  return chips;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const lower = v.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

/**
 * Removing a nav chip keeps the earlier path and demotes the later path keywords to tags.
 * Removing a tag chip drops it.
 */
export function removeActiveFilterChip(
  pathKeywords: string[],
  tagKeywords: string[],
  chip: ActiveFilterChip
): ActiveFilterState {
  if (chip.kind === "nav") {
    return {
      pathKeywords: pathKeywords.slice(0, chip.index),
      tagKeywords: dedupe([...pathKeywords.slice(chip.index + 1), ...tagKeywords]),
    };
  }
  const lower = chip.keyword.toLowerCase();
  return {
    pathKeywords,
    tagKeywords: tagKeywords.filter((k) => k.toLowerCase() !== lower),
  };
}
