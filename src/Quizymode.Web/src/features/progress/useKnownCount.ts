import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { KNOWN_ITEMS_CHANGED_EVENT, KNOWN_ITEMS_STORAGE_KEY, readKnownCount } from "./knownItems";
import { fetchSetKnownCount } from "./setProgressBatcher";

/**
 * Known-item count for a set: from browser storage for guests (#672) and from the account for signed-in users (#685,
 * GET /users/me/set-progress). Null while unknown, loading, failed or when there is no set key; a failure never blocks the page.
 */
export function useKnownCount(setKey: string | null): number | null {
  const { isAuthenticated, isLoading } = useAuth();
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
  const accountQuery = useQuery({
    queryKey: ["set-progress", setKey],
    queryFn: () => fetchSetKnownCount(setKey as string),
    enabled: isAuthenticated && !isLoading && !!setKey,
    retry: false,
  });
  if (!setKey) return null;
  if (isAuthenticated) return accountQuery.data ?? null;
  return readKnownCount(setKey);
}
