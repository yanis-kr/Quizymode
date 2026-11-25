// Feedback keeps the route context moderators need but never the query string or fragment (#815).
export const minimizePageUrl = (href: string): string => {
  try {
    const url = new URL(href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return href;
  }
};
