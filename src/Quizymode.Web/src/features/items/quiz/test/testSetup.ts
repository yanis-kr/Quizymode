import { TEST_MAX_LIMIT_SEC, TEST_MIN_LIMIT_SEC } from "../quizRun";

export type TimeLimitChoice = "none" | "per-1" | "per-2" | "custom";

export const CUSTOM_LIMIT_ERROR = "Enter 1 to 600 minutes.";

export interface ResolvedTimeLimit {
  /** Seconds, or null for no limit (also null when the custom value is invalid). */
  limitSec: number | null;
  error: string | null;
  /** True when a per-question preset was clamped to 600 minutes. */
  capped: boolean;
}

/** AC 3.18.2: No limit / 1 min per question / 2 min per question (each capped at 600 min) / Custom 1-600 min. */
export function resolveTimeLimit(choice: TimeLimitChoice, customMinutes: string, questionCount: number): ResolvedTimeLimit {
  if (choice === "none") return { limitSec: null, error: null, capped: false };
  if (choice === "custom") {
    const trimmed = customMinutes.trim();
    const minutes = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > TEST_MAX_LIMIT_SEC / 60) {
      return { limitSec: null, error: CUSTOM_LIMIT_ERROR, capped: false };
    }
    return { limitSec: minutes * 60, error: null, capped: false };
  }

  const raw = (choice === "per-1" ? 60 : 120) * Math.max(1, questionCount);
  const limitSec = Math.min(TEST_MAX_LIMIT_SEC, Math.max(TEST_MIN_LIMIT_SEC, raw));
  return { limitSec, error: null, capped: raw > TEST_MAX_LIMIT_SEC };
}

/** Maps a stored limit (Play again) back to the setup controls. */
export function choiceFromLimit(
  limitSec: number | null,
  questionCount: number,
): { choice: TimeLimitChoice; customMinutes: string } {
  if (limitSec === null) return { choice: "none", customMinutes: "" };
  if (resolveTimeLimit("per-1", "", questionCount).limitSec === limitSec) return { choice: "per-1", customMinutes: "" };
  if (resolveTimeLimit("per-2", "", questionCount).limitSec === limitSec) return { choice: "per-2", customMinutes: "" };
  return { choice: "custom", customMinutes: String(Math.round(limitSec / 60)) };
}

/** m:ss, or h:mm:ss from one hour up. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
