/**
 * Random id persisted in the browser's localStorage so a returning visitor can be recognized
 * across tabs and sessions (TRAFFIC-122), unlike the tab-scoped session id in
 * {@link ./pageViewTracking}. Never created, read, or sent when Global Privacy Control is on.
 */
export const VISITOR_ID_STORAGE_KEY = "quizymode.analytics.visitor-id";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string | null): value is string {
  return !!value && UUID_PATTERN.test(value);
}

function hasGlobalPrivacyControl(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}

function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback UUID v4 for environments without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Returns the visitor id, creating it on first call. Returns `null` (and never stores anything)
 * when Global Privacy Control is on or when `localStorage` is unavailable. A stored value that
 * isn't a syntactically valid UUID is treated as absent and replaced.
 */
export function getVisitorId(): string | null {
  if (hasGlobalPrivacyControl()) {
    return null;
  }

  try {
    const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
    if (isValidUuid(existing)) {
      return existing;
    }

    const nextVisitorId = createUuid();
    window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, nextVisitorId);
    return nextVisitorId;
  } catch {
    return null;
  }
}
