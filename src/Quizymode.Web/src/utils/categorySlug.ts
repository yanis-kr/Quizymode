/**
 * Converts a category name to a URL-friendly slug.
 * - Converts spaces to dashes
 * - Converts to lowercase
 * - Removes special characters (keeps alphanumeric, spaces, and dashes)
 * - Trims and collapses multiple dashes
 * 
 * @param categoryName - The category name to convert
 * @returns URL-friendly slug (e.g., "ACT Math" -> "act-math")
 */
export function categoryNameToSlug(categoryName: string): string {
  return categoryName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, and dashes
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Collapse multiple dashes into one
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
}

/**
 * Converts a category slug back to a category name.
 * This is a simple reverse operation that converts dashes back to spaces
 * and capitalizes appropriately.
 * 
 * Note: This is a best-effort conversion. For exact matching, you should
 * compare slugs against the actual category names in your database.
 * 
 * @param slug - The URL slug to convert
 * @returns Category name (e.g., "act-math" -> "Act Math")
 */
export function categorySlugToName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Finds the actual category name from a slug by matching against a list of categories.
 * This ensures we get the exact category name as stored in the database,
 * handling cases where capitalization or special characters might differ.
 * 
 * @param slug - The URL slug to match
 * @param categoryNames - Array of actual category names from the database
 * @returns The matching category name, or null if not found
 */
export function findCategoryNameFromSlug(
  slug: string,
  categoryNames: string[]
): string | null {
  // First, try exact slug match (case-insensitive)
  const exactMatch = categoryNames.find(
    name => categoryNameToSlug(name).toLowerCase() === slug.toLowerCase()
  );
  if (exactMatch) {
    return exactMatch;
  }

  // Fallback: try to match the slug-to-name conversion
  const convertedName = categorySlugToName(slug);
  const fallbackMatch = categoryNames.find(
    name => name.toLowerCase() === convertedName.toLowerCase()
  );
  if (fallbackMatch) {
    return fallbackMatch;
  }

  return null;
}

const ALL_CATEGORIES_SLUG = "all";

/** Slug used in URL for "All categories" scope. */
export function getAllCategoriesSlug(): string {
  return ALL_CATEGORIES_SLUG;
}

/** True when slug means "all categories" (no category filter). */
export function isAllCategoriesSlug(slug: string | undefined): boolean {
  return !slug || slug === "" || slug === ALL_CATEGORIES_SLUG;
}

/** Base path for category (no keyword segments). Use with ?keywords=... for filtering. */
export function getCategoryBasePath(categorySlug: string): string {
  return isAllCategoriesSlug(categorySlug) ? "/categories" : `/categories/${categorySlug}`;
}

/** Builds URL path for category + optional keywords. Uses slugs for category, encoded names for keywords. Empty slug = all categories → /categories. When "all", keywords are not put in path (use query params). */
export function buildCategoryPath(
  categorySlug: string,
  keywords?: string[]
): string {
  const base = getCategoryBasePath(categorySlug);
  if (!keywords || keywords.length === 0 || isAllCategoriesSlug(categorySlug)) {
    return base;
  }
  const kwSegment = keywords
    .map((k) => encodeURIComponent(k))
    .join("/");
  return `${base}/${kwSegment}`;
}

/** Parses keyword from URL segment (decode and handle 'other'). */
export function parseKeywordSegment(segment: string): string {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded;
  } catch {
    return segment;
  }
}

/**
 * Display name for a category given either its stored name ("Trivia") or a URL slug ("trivia", "act-math").
 * A value that already has capital letters is returned as is, so a stored name is never re-cased (#650).
 */
export function categoryDisplayName(slugOrName: string): string {
  const trimmed = slugOrName.trim();
  if (/[A-Z]/.test(trimmed)) return trimmed;
  return categorySlugToName(trimmed);
}

// Keyword segments that are acronyms, shown in capitals (AC 3.6.4).
const KEYWORD_ACRONYMS = new Set(["aws", "saa", "gcp", "sql", "api"]);

/**
 * Display name for a navigation keyword (URLs keep the raw keyword, #713):
 * "saa-c03" -> "SAA-C03", "aws" -> "AWS", "act-math" -> "Act Math", "other" -> "Others".
 * A letter-digit code such as "c03" is joined to the word before it with a dash, and is capitalised.
 */
export function keywordDisplayName(name: string): string {
  if (name.toLowerCase() === "other") return "Others";
  const parts = name.trim().toLowerCase().split("-").filter(Boolean);
  let out = "";
  parts.forEach((part, i) => {
    const word = KEYWORD_ACRONYMS.has(part) || /\d/.test(part)
      ? part.toUpperCase()
      : part.charAt(0).toUpperCase() + part.slice(1);
    const isCode = /^[A-Z]\d+$/.test(word) && i > 0 && /^[A-Z]+$/.test(out.split(/[ -]/).pop() ?? "");
    out += i === 0 ? word : isCode ? `-${word}` : ` ${word}`;
  });
  return out || categoryDisplayName(name);
}
