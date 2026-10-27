import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reviewQueueApi } from "@/api/learningLoop";
import { useAuth } from "@/contexts/AuthContext";

/** Status line for the Add misses to Review control (AC 3.20.9). */
export function describeAddResult(added: number, unavailable: number, failed: number): string {
  const cantAdd: string = unavailable > 0 ? ` ${unavailable} can't be added.` : "";
  if (failed > 0) {
    return added > 0
      ? `Added ${added}. Couldn't add ${failed}.${cantAdd}`
      : `Couldn't add ${failed} to Review.${cantAdd}`;
  }
  if (added > 0) return `Added ${added} to Review.${cantAdd}`;
  if (unavailable > 0) {
    return unavailable === 1 ? "This can't be added to Review." : "These can't be added to Review.";
  }
  return "";
}

/** unavailable = the API answered 404 (item gone or not visible to this user); everything else is retryable. */
type AddOutcome = "added" | "unavailable" | "failed";

export interface AddMissesToReview {
  /** Signed in and auth settled; guests never get the control. */
  canAdd: boolean;
  isPending: boolean;
  added: number;
  unavailable: number;
  failed: number;
  /** True once at least one item has been attempted. */
  attempted: boolean;
  /** Queues the not-yet-added items one after another (on a retry, only the failed ones). */
  addAll: () => Promise<void>;
}

/**
 * Explicit "Add misses to Review" (AC 3.20.9). Calls POST /review-queue/{id} once per unique id, sequentially, so the
 * limit of AC 3.14.5 is never approached. State belongs to `runId`: a new run starts clean.
 */
export function useAddMissesToReview(runId: string, itemIds: readonly string[]): AddMissesToReview {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [outcomes, setOutcomes] = useState<{ runId: string; byId: Record<string, AddOutcome> }>({
    runId,
    byId: {},
  });
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const byId: Record<string, AddOutcome> = outcomes.runId === runId ? outcomes.byId : {};
  const uniqueIds: string[] = Array.from(new Set(itemIds));
  const count = (kind: AddOutcome): number => uniqueIds.filter((id) => byId[id] === kind).length;

  const addAll = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    const toTry: string[] = Array.from(new Set(itemIds)).filter((id) => {
      const known: AddOutcome | undefined = outcomes.runId === runId ? outcomes.byId[id] : undefined;
      return known !== "added" && known !== "unavailable";
    });
    if (toTry.length === 0) return;
    inFlight.current = true;
    setPendingRunId(runId);
    const next: Record<string, AddOutcome> = { ...(outcomes.runId === runId ? outcomes.byId : {}) };
    let addedAny = false;
    try {
      for (const id of toTry) {
        if (!mounted.current) return;
        try {
          await reviewQueueApi.enqueue(id);
          next[id] = "added";
          addedAny = true;
        } catch (error: unknown) {
          const status: number | undefined = (error as { response?: { status?: number } })?.response?.status;
          next[id] = status === 404 ? "unavailable" : "failed";
        }
      }
      if (addedAny) void queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      if (mounted.current) setOutcomes({ runId, byId: next });
    } finally {
      inFlight.current = false;
      if (mounted.current) setPendingRunId(null);
    }
  }, [itemIds, outcomes, queryClient, runId]);

  return {
    canAdd: isAuthenticated && !isLoading,
    isPending: pendingRunId === runId,
    added: count("added"),
    unavailable: count("unavailable"),
    failed: count("failed"),
    attempted: uniqueIds.some((id) => byId[id] !== undefined),
    addAll,
  };
}
