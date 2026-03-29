const SESSION_STORAGE_KEY = "quizymode.analytics.session-id";
const LAST_VIEW_STORAGE_KEY = "quizymode.analytics.last-view";
const DUPLICATE_WINDOW_MS = 1500;

let fallbackSessionId = createSessionId();

export function getPageViewSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const nextSessionId = createSessionId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    return nextSessionId;
  } catch {
    return fallbackSessionId;
  }
}

export function shouldTrackPageView(path: string, queryString: string): boolean {
  const marker = `${path}${queryString}`;
  const now = Date.now();

  try {
    const raw = window.sessionStorage.getItem(LAST_VIEW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { marker?: string; createdAt?: number };
      if (
        parsed.marker === marker &&
        typeof parsed.createdAt === "number" &&
        now - parsed.createdAt < DUPLICATE_WINDOW_MS
      ) {
        return false;
      }
    }

    window.sessionStorage.setItem(
      LAST_VIEW_STORAGE_KEY,
      JSON.stringify({ marker, createdAt: now })
    );
  } catch {
    return true;
  }

  return true;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
