import { MAX_SET_PROGRESS_SCOPES, studySessionsApi } from "@/api/studySessions";

interface Pending {
  resolve: (count: number) => void;
  reject: (error: unknown) => void;
}

const BATCH_WINDOW_MS = 20;
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
  return new Promise<number>((resolve, reject) => {
    const waiters = pending.get(scope) ?? [];
    waiters.push({ resolve, reject });
    pending.set(scope, waiters);
    if (timer === null) timer = setTimeout(() => void flush(), BATCH_WINDOW_MS);
  });
}
