import { categoryNameToSlug } from "@/utils/categorySlug";

const WHY_CATEGORY_SLUGS = new Set(["exams", "tech"]);

/**
 * Label above the explanation on the /quiz answer card (#713): exam and tech explanations are rationales, so they read
 * "Why"; every other category keeps "Did you know?".
 */
export function rationaleLabel(category: string | null | undefined): string {
  const slug = categoryNameToSlug(category ?? "").toLowerCase();
  return WHY_CATEGORY_SLUGS.has(slug) ? "Why" : "Did you know?";
}
