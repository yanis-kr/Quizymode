const SESSION_STORAGE_KEY = "quizymode.analytics.session-id";
const LAST_VIEW_STORAGE_KEY = "quizymode.analytics.last-view";
/**
 * Set by an admin ("Exclude this browser from analytics") and by Playwright runs.
 * Lives in localStorage so it survives tabs and sign-outs on that device.
 */
export const INTERNAL_BROWSER_STORAGE_KEY = "quizymode.analytics.internal-browser";
const DUPLICATE_WINDOW_MS = 1500;

const fallbackSessionId = createSessionId();

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

/** Query parameters of the Cognito/OAuth redirect. They are credentials or error text and must never be recorded. */
const OAUTH_PARAMS = ["code", "state", "error", "error_description"] as const;

/** Removes OAuth redirect parameters from a query string (leading "?" kept when anything remains). */
export function stripRedirectResultParams(queryString: string): string {
  if (!queryString) return "";
  const params = new URLSearchParams(queryString);
  OAUTH_PARAMS.forEach((name) => params.delete(name));
  const remaining = params.toString();
  return remaining ? `?${remaining}` : "";
}

/** The OAuth landing page is never recorded. */
export function isAuthCallbackPath(path: string): boolean {
  return path === "/auth/callback" || path.startsWith("/auth/callback/");
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

export function isInternalBrowser(): boolean {
  try {
    return window.localStorage.getItem(INTERNAL_BROWSER_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setInternalBrowser(isInternal: boolean): void {
  try {
    if (isInternal) {
      window.localStorage.setItem(INTERNAL_BROWSER_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(INTERNAL_BROWSER_STORAGE_KEY);
    }
  } catch {
    // Storage blocked: the browser simply stays unmarked.
  }
}

/** Admin screens are never recorded; they would only measure the admin. */
export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
