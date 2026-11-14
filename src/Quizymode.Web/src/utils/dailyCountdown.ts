const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * When the next daily quiz starts (epoch ms): 00:00 UTC the day after the server's quiz date (`YYYY-MM-DD`), or, without a
 * usable date, the next UTC midnight after `now`. Callers show only a duration, so no time zone is ever named.
 */
export function nextDailyResetAt(now: number, quizDate?: string | null): number {
  const start = quizDate && /^\d{4}-\d{2}-\d{2}$/.test(quizDate) ? Date.parse(`${quizDate}T00:00:00Z`) : Number.NaN;
  if (Number.isFinite(start)) return start + DAY_MS;
  return Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
}

/** Milliseconds until the next daily quiz; zero or less means it is ready. */
export function msUntilNextDaily(now: number, quizDate?: string | null): number {
  return nextDailyResetAt(now, quizDate) - now;
}

/** "5 h 12 min", "5 h", "12 min" or "less than a minute"; whole minutes are rounded down and seconds are never shown. */
export function formatCountdown(ms: number): string {
  if (ms < MINUTE_MS) return "less than a minute";
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/**
 * How long until the displayed text can change: the next whole-minute boundary of the remaining time, or the zero
 * moment once under a minute.
 */
export function msUntilCountdownChanges(remainingMs: number): number {
  if (remainingMs <= 0) return MINUTE_MS;
  if (remainingMs < MINUTE_MS) return remainingMs;
  return (remainingMs % MINUTE_MS) + 1;
}
