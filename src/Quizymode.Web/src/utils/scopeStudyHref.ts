/** Adds `size=<n>` to a route, keeping any existing query string. */
export function withQuizSize(href: string, size: number): string {
  return `${href}${href.includes("?") ? "&" : "?"}size=${size}`;
}

/** Route to a study mode for a category scope; the path keywords travel as nav and keywords, like the mode tabs. */
export function buildScopeStudyHref(mode: "quiz" | "explore" | "games", categorySlug: string, nav: string[]): string {
  const params = new URLSearchParams();
  if (nav.length > 0) {
    params.set("nav", nav.join(","));
    params.set("keywords", nav.join(","));
  }
  const query = params.toString();
  return `/${mode}/${categorySlug}${query ? `?${query}` : ""}`;
}
