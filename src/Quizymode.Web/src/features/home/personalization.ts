import type { FeaturedSetDto } from "@/api/featured";
import type { GuestHistorySource } from "@/features/guestHistory/guestHistoryStorage";

/**
 * Deterministic personalized-home ranking (PERSONAL-001, #116; decision record 2026-10-17).
 *
 * - Continue: the newest completed runs with a browsable source, one per source, at most 3.
 * - For you: explicit interests in the order chosen, then categories inferred from recent activity; at most 5.
 * - Recommended next: featured sets in For-you categories that were not attempted yet, in category rank then catalog
 *   (featured sort) order, with at most 2 per category in the first 5. A For-you category with no unattempted featured
 *   set gets one category-level "Explore" card in its place, so every chosen topic is represented (#220). With no
 *   interests and no history (cold start), popular categories replace For you; without those, the featured catalog
 *   order is used.
 * - Focused Home (#382, the visitor has chosen topics): For you lists every chosen topic (up to 10, saved order) and adds
 *   inferred categories only while fewer than 3 are chosen, up to 5 in all. Recommended next never fills from the catalog.
 */
export const CONTINUE_LIMIT = 3;
export const FOR_YOU_LIMIT = 5;
export const RECOMMENDED_LIMIT = 5;
export const MAX_PER_CATEGORY = 2;
/** Focused Home adds inferred categories only while fewer topics than this are chosen. */
const FOCUSED_INFERENCE_BELOW = 3;

export interface ActivityRun {
  completedAt: string;
  source: GuestHistorySource | null;
  /** Defaults to quiz; Continue links open Learn for learn runs. Inference counts both modes. */
  mode?: "quiz" | "learn";
}

export interface PersonalizationInput {
  explicitInterests: string[];
  /** Completed runs in any order (server sessions when signed in, guest summaries otherwise). */
  runs: ActivityRun[];
  featuredSets: FeaturedSetDto[];
  popularCategories: string[];
  /** Category slugs the SPA can show; anything else is ignored. */
  knownCategories: string[];
  /** Display names by slug, for category-level fallback cards; the slug is used when missing. */
  categoryNames?: ReadonlyMap<string, string>;
  /** Focused Home: the visitor's chosen topics lead, so inference and catalog filling are reduced. */
  focused?: boolean;
}

/** Id prefix of the category-level card used when a For-you category has no featured set to recommend. */
export const CATEGORY_FALLBACK_ID_PREFIX = "category-fallback:";

function categoryFallback(slug: string, name: string): FeaturedSetDto {
  return {
    id: `${CATEGORY_FALLBACK_ID_PREFIX}${slug}`,
    displayName: `Explore ${name}`,
    categorySlug: slug,
    navKeyword1: null,
    navKeyword2: null,
    itemCount: 0,
    lastModifiedAt: null,
    sortOrder: Number.MAX_SAFE_INTEGER,
  };
}

export interface ForYouCategory {
  slug: string;
  reason: "explicit" | "inferred";
}

export interface PersonalizedHome {
  continueRuns: ActivityRun[];
  forYou: ForYouCategory[];
  recommended: FeaturedSetDto[];
  isColdStart: boolean;
}

function newestFirst(runs: ActivityRun[]): ActivityRun[] {
  return [...runs].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}

export function sourceKey(source: GuestHistorySource): string {
  if (source.kind === "collection") return `collection:${source.collectionId}`;
  if (source.kind === "category") {
    return `category:${source.categorySlug}:${source.navigationKeywords.join("/")}:${source.filterKeywords.join(",")}`;
  }
  return `global:${source.filterKeywords.join(",")}`;
}

function featuredKey(slug: string, keywords: string[]): string {
  return `${slug.toLowerCase()}:${keywords.map((k) => k.toLowerCase()).join("/")}`;
}

function setKeywords(set: FeaturedSetDto): string[] {
  return [set.navKeyword1, set.navKeyword2].filter((k): k is string => Boolean(k));
}

function pickDiverse(candidates: FeaturedSetDto[], limit: number): FeaturedSetDto[] {
  const picked: FeaturedSetDto[] = [];
  const perCategory = new Map<string, number>();
  const skipped: FeaturedSetDto[] = [];
  for (const set of candidates) {
    if (picked.length >= limit) break;
    const count = perCategory.get(set.categorySlug) ?? 0;
    if (count >= MAX_PER_CATEGORY) {
      skipped.push(set);
      continue;
    }
    picked.push(set);
    perCategory.set(set.categorySlug, count + 1);
  }
  // The diversity cap only shapes the first slots; fill any remaining room in order rather than leave it empty.
  for (const set of skipped) {
    if (picked.length >= limit) break;
    picked.push(set);
  }
  return picked;
}

export function rankPersonalizedHome(input: PersonalizationInput): PersonalizedHome {
  const known = new Set(input.knownCategories);
  const runs = newestFirst(input.runs);

  const continueRuns: ActivityRun[] = [];
  const seenSources = new Set<string>();
  for (const run of runs) {
    if (!run.source) continue;
    const key = sourceKey(run.source);
    if (seenSources.has(key)) continue;
    seenSources.add(key);
    continueRuns.push(run);
    if (continueRuns.length >= CONTINUE_LIMIT) break;
  }

  const explicit = Array.from(new Set(input.explicitInterests.filter((slug) => known.has(slug))));
  const inferred: string[] = [];
  for (const run of runs) {
    if (run.source?.kind !== "category") continue;
    const slug = run.source.categorySlug;
    if (known.has(slug) && !explicit.includes(slug) && !inferred.includes(slug)) inferred.push(slug);
  }
  const focused = input.focused === true;
  const explicitEntries = explicit.map((slug) => ({ slug, reason: "explicit" as const }));
  const inferredEntries = inferred.map((slug) => ({ slug, reason: "inferred" as const }));
  const forYou: ForYouCategory[] =
    focused && explicit.length >= FOCUSED_INFERENCE_BELOW
      ? explicitEntries
      : [...explicitEntries, ...inferredEntries].slice(0, FOR_YOU_LIMIT);

  const isColdStart = explicit.length === 0 && runs.length === 0;
  const rankCategories = isColdStart
    ? Array.from(new Set(input.popularCategories.filter((slug) => known.has(slug))))
    : forYou.map((entry) => entry.slug);

  const attempted = new Set<string>();
  for (const run of runs) {
    if (run.source?.kind === "category") {
      attempted.add(featuredKey(run.source.categorySlug, run.source.navigationKeywords));
    }
  }
  const catalog = [...input.featuredSets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((set) => !attempted.has(featuredKey(set.categorySlug, setKeywords(set))));

  const rank = (slug: string) => rankCategories.indexOf(slug.toLowerCase());
  const inRanked = catalog
    .filter((set) => rank(set.categorySlug) >= 0)
    .sort((a, b) => rank(a.categorySlug) - rank(b.categorySlug) || a.sortOrder - b.sortOrder);
  // A chosen category with nothing left to recommend gets a category-level card in its rank position.
  const withFallbacks = isColdStart
    ? inRanked
    : rankCategories.flatMap((slug) => {
        const sets = inRanked.filter((set) => set.categorySlug.toLowerCase() === slug);
        return sets.length > 0 ? sets : [categoryFallback(slug, input.categoryNames?.get(slug) ?? slug)];
      });
  // Interest categories only, unless no featured set matched or this is a cold start: then the catalog fills in after them
  // (never when focused, where the fallback cards already cover every chosen topic).
  const fillFromCatalog = !focused && (isColdStart || inRanked.length === 0);
  const candidates = fillFromCatalog
    ? [...withFallbacks, ...catalog.filter((set) => !inRanked.includes(set))]
    : withFallbacks;
  const recommended = pickDiverse(candidates, RECOMMENDED_LIMIT);

  return { continueRuns, forYou, recommended, isColdStart };
}
