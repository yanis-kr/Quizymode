import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { interestsApi } from "@/api/learningLoop";
import { GUEST_HISTORY_CHANGED_EVENT } from "@/features/guestHistory/guestHistoryStorage";
import {
  LEARNING_STATE_CHANGED_EVENT,
  readLocalInterests,
  writeLocalInterests,
} from "@/features/learningLoop/localLearningState";

export const INTERESTS_QUERY_KEY = (userId: string | null | undefined) => ["interests", userId] as const;

/** Whether the saved topics are known yet. Saving is only allowed once they are, so a failed load never wipes them. */
export type InterestsStatus = "loading" | "error" | "ready";

/** Bumps when browser-local learning state changes in this tab or another, so derived values re-read storage. */
export function useLocalVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((current) => current + 1);
    const events = [LEARNING_STATE_CHANGED_EVENT, GUEST_HISTORY_CHANGED_EVENT, "storage"];
    events.forEach((name) => window.addEventListener(name, bump));
    return () => events.forEach((name) => window.removeEventListener(name, bump));
  }, []);
  return version;
}

/**
 * The visitor's chosen topics (#116, #382): the account's list when signed in, otherwise the ones saved in this
 * browser. Guests are always "ready"; the signed-in read and write never retry, so a failure is shown, not hidden.
 */
export function useInterests({ enabled = true }: { enabled?: boolean } = {}) {
  const { isAuthenticated, isLoading: isAuthLoading, userId } = useAuth();
  const queryClient = useQueryClient();
  const localVersion = useLocalVersion();
  const signedIn = isAuthenticated && !isAuthLoading;

  const query = useQuery({
    queryKey: INTERESTS_QUERY_KEY(userId),
    queryFn: () => interestsApi.get(),
    enabled: signedIn && enabled,
    retry: false,
    // A failed load stays an error until Retry; remounting an observer must not silently reset it to loading.
    retryOnMount: false,
  });

  const mutation = useMutation({
    mutationFn: async (categories: string[]) => {
      if (signedIn) return interestsApi.replace(categories);
      if (!writeLocalInterests(categories)) throw new Error("Storage unavailable");
      return categories;
    },
    onSuccess: (categories) => {
      if (signedIn) queryClient.setQueryData(INTERESTS_QUERY_KEY(userId), categories);
    },
  });

  const local = useMemo(
    () => readLocalInterests(),
    // localVersion re-reads browser storage after a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localVersion],
  );
  const interests: string[] = signedIn ? (query.data ?? []) : local;
  const status: InterestsStatus = !signedIn ? "ready" : query.isSuccess ? "ready" : query.isError ? "error" : "loading";

  return {
    interests,
    status,
    isGuest: !signedIn,
    retry: () => void query.refetch(),
    retrying: query.isFetching,
    save: (categories: string[]): Promise<void> => mutation.mutateAsync(categories).then(() => undefined),
    saving: mutation.isPending,
    saveError: mutation.isError,
    resetSave: () => mutation.reset(),
  };
}
