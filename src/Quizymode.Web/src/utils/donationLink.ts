/**
 * Optional hosted donation link (issue #497). Hidden unless VITE_DONATION_URL is set to an
 * https URL. No platform script, iframe, or cookie is loaded; the link is a plain anchor.
 */
export function resolveDonationUrl(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const DONATION_URL: string | undefined = resolveDonationUrl(import.meta.env.VITE_DONATION_URL);

export function getDonationHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}
