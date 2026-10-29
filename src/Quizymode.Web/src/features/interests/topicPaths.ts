import { buildCategoryPath } from "@/utils/categorySlug";
import type { TaxonomyResponse } from "@/api/taxonomy";

/** The same bounded category[/l1[/l2]] tokens accepted by interests and game rosters. */
export const TOPIC_PATH_PATTERN = /^[a-z0-9_-]{1,64}(?:\/[a-zA-Z0-9-]{1,30}){0,2}$/;

export function isTopicPath(value: unknown): value is string {
  return typeof value === "string" && TOPIC_PATH_PATTERN.test(value);
}

export function topicParts(path: string): { category: string; navigationKeywords: string[] } {
  const [category, ...navigationKeywords] = path.split("/");
  return { category, navigationKeywords };
}

export function topicsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

/** Account choices win when claiming a conflicting guest choice; never broaden or silently replace a saved refinement. */
export function mergeTopics(account: string[], guest: string[], limit = 10): string[] {
  const result = [...account];
  for (const topic of guest) {
    if (result.length >= limit) break;
    if (isTopicPath(topic) && !result.some((existing) => topicsOverlap(existing, topic))) result.push(topic);
  }
  return result;
}

export function topicLabel(path: string, categoryNames?: ReadonlyMap<string, string>): string {
  const { category, navigationKeywords } = topicParts(path);
  const title = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return [categoryNames?.get(category) ?? title(category), ...navigationKeywords.map(title)].join(" › ");
}

export function topicBrowsePath(path: string): string {
  const { category, navigationKeywords } = topicParts(path);
  return buildCategoryPath(category, navigationKeywords);
}

export function topicNavigationSearch(path: string): string {
  const { navigationKeywords } = topicParts(path);
  return navigationKeywords.length ? `?${new URLSearchParams({ nav: navigationKeywords.join(",") })}` : "";
}

export function taxonomyTopicPaths(taxonomy: TaxonomyResponse): Set<string> {
  return new Set(taxonomy.categories.flatMap(category => [category.slug, ...category.groups.flatMap(group => [
    `${category.slug}/${group.slug}`, ...group.keywords.map(leaf => `${category.slug}/${group.slug}/${leaf.slug}`),
  ])]));
}
