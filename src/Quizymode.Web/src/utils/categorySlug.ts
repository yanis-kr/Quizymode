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
