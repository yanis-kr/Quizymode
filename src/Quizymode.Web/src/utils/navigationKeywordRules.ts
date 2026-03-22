/** Rules for navigation (rank-1 / rank-2) keyword names — aligned with bulk create and API. */

export const NAV_KEYWORD_MAX_LEN = 30;
export const NAV_KEYWORD_PATTERN = /^[a-zA-Z0-9-]+$/;

/** Returns an error message if invalid, or null if empty or valid. */
export function validateNavigationKeywordName(name: string): string | null {
  const t = name.trim();
  if (!t) return null;
  if (t.length > NAV_KEYWORD_MAX_LEN) return `Max ${NAV_KEYWORD_MAX_LEN} characters`;
  if (!NAV_KEYWORD_PATTERN.test(t)) return "Use only letters, numbers, and hyphens";
  return null;
}
