import { useCallback, useEffect, useState } from "react";
import {
  GUEST_HISTORY_CHANGED_EVENT,
  GUEST_HISTORY_STORAGE_KEY,
  clearGuestHistory,
  readGuestHistory,
  type GuestRunSummary,
} from "./guestHistoryStorage";

export function useGuestHistory(): {
  summaries: GuestRunSummary[];
  clear: () => boolean;
} {
  const [summaries, setSummaries] = useState<GuestRunSummary[]>(() => readGuestHistory());

  useEffect(() => {
    const refresh = () => setSummaries(readGuestHistory());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === GUEST_HISTORY_STORAGE_KEY) refresh();
    };
    window.addEventListener(GUEST_HISTORY_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GUEST_HISTORY_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const clear = useCallback(() => {
    const cleared = clearGuestHistory();
    setSummaries(readGuestHistory());
    return cleared;
  }, []);

  return { summaries, clear };
}
