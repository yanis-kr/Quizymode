import type { TaxonomyResponse } from "@/api/taxonomy";

/** One selectable leaf: a full category > L1 > L2 path from GET /taxonomy. */
export interface TopicPath {
  category: string;
  l1: string;
  l2: string;
  /** The L2 node's YAML description ("" when none). */
  description: string;
  /** The category's YAML description, shown on its group heading. */
  categoryDescription: string;
  /** Position in taxonomy order, used as the final tie-break. */
  order: number;
  categoryIndex: number;
  categoryWords: string[];
  l1Words: string[];
  l2Words: string[];
  l1Text: string;
  l2Text: string;
  categoryText: string;
  descriptionWords: string[];
}

export interface TopicPathGroup {
  category: string;
  paths: TopicPath[];
}

export interface TopicPathResult {
  groups: TopicPathGroup[];
  /** Number of options shown (the cap applies before grouping). */
  shown: number;
  /** True when more paths matched than the cap allows. */
  overflow: boolean;
  /** Lower-cased query words, for highlighting. */
  tokens: string[];
}

/** The picker needs this many characters before it lists anything (AC 12.15). */
export const MIN_TOPIC_QUERY_LENGTH = 2;
export const MAX_TOPIC_OPTIONS = 50;

const WORD = /[\p{L}\p{N}]+/gu;

export function wordsOf(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

export function buildTopicPaths(taxonomy: TaxonomyResponse | undefined): TopicPath[] {
  const paths: TopicPath[] = [];
  taxonomy?.categories.forEach((category, categoryIndex) => {
    for (const group of category.groups) {
      for (const keyword of group.keywords) {
        const description = keyword.description ?? "";
        paths.push({
          category: category.slug,
          l1: group.slug,
          l2: keyword.slug,
          description,
          categoryDescription: category.description ?? "",
          order: paths.length,
          categoryIndex,
          categoryWords: wordsOf(category.slug),
          l1Words: wordsOf(group.slug),
          l2Words: wordsOf(keyword.slug),
          categoryText: category.slug.toLowerCase(),
          l1Text: group.slug.toLowerCase(),
          l2Text: keyword.slug.toLowerCase(),
          descriptionWords: wordsOf(description),
        });
      }
    }
  });
  return paths;
}

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    // One substitution, or one adjacent transposition.
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i);
}

/** 4 exact word, 3 word prefix, 2 substring, 1 one typo (4+ characters); 0 no match. */
function grade(token: string, words: string[], text: string | null): number {
  if (words.includes(token)) return 4;
  if (words.some((word) => word.startsWith(token))) return 3;
  if (text ? text.includes(token) : words.some((word) => word.includes(token))) return 2;
  if (token.length >= 4 && words.some((word) => word.length >= 4 && withinOneEdit(word, token))) return 1;
  return 0;
}

function scoreToken(path: TopicPath, token: string): number {
  return Math.max(
    grade(token, path.l2Words, path.l2Text) * 1,
    grade(token, path.l1Words, path.l1Text) * 0.8,
    grade(token, path.categoryWords, path.categoryText) * 0.6,
    grade(token, path.descriptionWords, null) * 0.5
  );
}

/**
 * Local filter for the topic picker. Every query word must match the category, L1 or L2 slug words or the L2
 * description (exact > prefix > substring > one typo); the best `max` paths are kept and grouped by category.
 */
export function filterTopicPaths(
  paths: readonly TopicPath[],
  query: string,
  max: number = MAX_TOPIC_OPTIONS
): TopicPathResult {
  const trimmed = query.trim();
  const tokens = [...new Set(wordsOf(trimmed))];
  if (trimmed.length < MIN_TOPIC_QUERY_LENGTH || tokens.length === 0) {
    return { groups: [], shown: 0, overflow: false, tokens };
  }

  const scored: { path: TopicPath; score: number }[] = [];
  for (const path of paths) {
    let total = 0;
    let matchedAll = true;
    for (const token of tokens) {
      const score = scoreToken(path, token);
      if (score === 0) {
        matchedAll = false;
        break;
      }
      total += score;
    }
    if (matchedAll) scored.push({ path, score: total });
  }

  scored.sort((a, b) => b.score - a.score || a.path.order - b.path.order);
  const kept = scored.slice(0, max);

  const groups: TopicPathGroup[] = [];
  const byCategory = new Map<string, TopicPathGroup>();
  for (const { path } of kept) {
    let group = byCategory.get(path.category);
    if (!group) {
      group = { category: path.category, paths: [] };
      byCategory.set(path.category, group);
      groups.push(group);
    }
    group.paths.push(path);
  }

  return { groups, shown: kept.length, overflow: scored.length > kept.length, tokens };
}

export function topicPathKey(path: { category: string; l1: string; l2: string }): string {
  return `${path.category}/${path.l1}/${path.l2}`;
}
