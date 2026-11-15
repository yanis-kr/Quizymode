import { useEffect, useState } from "react";
import { KNOWN_ITEMS_CHANGED_EVENT, KNOWN_ITEMS_STORAGE_KEY, readKnownCount } from "./knownItems";

/** Known-item count for a set from browser storage; guests only, so signed-in users get null. */
export function useKnownCount(setKey: string | null, enabled: boolean): number | null {
  const [, refresh] = useState(0);
  useEffect(() => {
    const bump = () => refresh((n) => n + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === KNOWN_ITEMS_STORAGE_KEY) bump();
    };
    window.addEventListener(KNOWN_ITEMS_CHANGED_EVENT, bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(KNOWN_ITEMS_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  if (!enabled || !setKey) return null;
  return readKnownCount(setKey);
}
