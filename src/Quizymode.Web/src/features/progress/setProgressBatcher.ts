import { MAX_SET_PROGRESS_SCOPES, studySessionsApi } from "@/api/studySessions";

interface Pending {
  resolve: (count: number) => void;
  reject: (error: unknown) => void;
}

const BATCH_WINDOW_MS = 20;

// Mirror the server's scope validation (GetSetProgress.cs): one invalid key makes the whole call a 400, so it is dropped
// here and counts as 0 instead of failing the other tiles in the batch (#694).
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CATEGORY_SLUG_PATTERN = /^[a-z0-9_-]{1,64}$/;
const KEYWORD_PATTERN = /^[a-z0-9-]{1,30}$/;
const MAX_NAVIGATION_KEYWORDS = 2;
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

export function isValidSetScope(scope: string): boolean {
  const parts = scope.trim().toLowerCase().split("/");
  if (parts.length === 2 && parts[0] === "c") return GUID_PATTERN.test(parts[1]) && parts[1] !== EMPTY_GUID;
  return (
    parts.length >= 2 &&
    parts.length <= 2 + MAX_NAVIGATION_KEYWORDS &&
    parts[0] === "s" &&
    CATEGORY_SLUG_PATTERN.test(parts[1]) &&
    parts.slice(2).every((k) => KEYWORD_PATTERN.test(k))
  );
}
let pending = new Map<string, Pending[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  const batch = pending;
  pending = new Map();
  timer = null;
  const scopes = Array.from(batch.keys());
  for (let i = 0; i < scopes.length; i += MAX_SET_PROGRESS_SCOPES) {
    const chunk = scopes.slice(i, i + MAX_SET_PROGRESS_SCOPES);
    try {
      const response = await studySessionsApi.getSetProgress(chunk);
      const counts = new Map(response.scopes.map((s) => [s.scope, s.knownCount]));
      for (const scope of chunk) {
        for (const waiter of batch.get(scope) ?? []) waiter.resolve(counts.get(scope) ?? 0);
      }
    } catch (error) {
      for (const scope of chunk) {
        for (const waiter of batch.get(scope) ?? []) waiter.reject(error);
      }
    }
  }
}

/**
 * Known-item count for one set key (#685). Requests made in the same short window (for example every Home tile)
 * share one call to GET /users/me/set-progress, at most 12 scopes per call.
 */
export function fetchSetKnownCount(scope: string): Promise<number> {
  if (!isValidSetScope(scope)) return Promise.resolve(0);
  return new Promise<number>((resolve, reject) => {
    const waiters = pending.get(scope) ?? [];
    waiters.push({ resolve, reject });
    pending.set(scope, waiters);
    if (timer === null) timer = setTimeout(() => void flush(), BATCH_WINDOW_MS);
  });
}
