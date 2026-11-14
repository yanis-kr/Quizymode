import { useEffect, useState } from "react";
import { formatCountdown, msUntilCountdownChanges, msUntilNextDaily } from "@/utils/dailyCountdown";

export interface DailyCountdown {
  /** "5 h 12 min", "12 min" or "less than a minute"; no time zone, date or seconds. */
  text: string;
  /** True once the next daily quiz has started. */
  isReady: boolean;
}

/**
 * Time until the next daily quiz (#649). Ticks only when the shown text can change, and recomputes when the tab becomes
 * visible again (a sleeping tab skips timers). It never refetches: at zero the caller decides what to do, because a
 * refetch would remount the quiz and wipe a run in progress or the results on screen.
 */
export function useDailyCountdown(quizDate?: string | null): DailyCountdown {
  const [now, setNow] = useState<number>(() => Date.now());
  const remaining = msUntilNextDaily(now, quizDate);
  const isReady = remaining <= 0;

  useEffect(() => {
    if (isReady) return;
    const timer = window.setTimeout(() => setNow(Date.now()), msUntilCountdownChanges(remaining));
    return () => window.clearTimeout(timer);
  }, [remaining, isReady]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  return { text: formatCountdown(Math.max(0, remaining)), isReady };
}
