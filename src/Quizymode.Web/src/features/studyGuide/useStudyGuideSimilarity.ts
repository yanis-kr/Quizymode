import { useQuery } from "@tanstack/react-query";
import { studyGuideDocumentsApi } from "@/api/studyGuideDocuments";
import { similarityCheckResponseSchema, type SimilarityFlag } from "./studyGuideDocumentSchema";

const MAX_CHECK_CANDIDATES = 200;
const EMPTY: Record<string, SimilarityFlag> = {};

/**
 * Similar-question flags (#369) for the candidates awaiting review, keyed by candidate id. Read-only; a failed check
 * simply shows no flags (Keep both is the behavior without it).
 */
export function useStudyGuideSimilarity(documentId: string, candidateIds: string[]): Record<string, SimilarityFlag> {
  const ids = candidateIds.slice(0, MAX_CHECK_CANDIDATES);
  const { data } = useQuery({
    queryKey: ["studyGuideDocuments", documentId, "similar", [...ids].sort().join(",")],
    queryFn: async () => {
      const parsed = similarityCheckResponseSchema.parse(await studyGuideDocumentsApi.similarCheck(documentId, ids));
      return Object.fromEntries(parsed.flags.map((flag) => [flag.candidateId, flag]));
    },
    enabled: !!documentId && ids.length > 0,
    retry: false,
    staleTime: 60_000,
  });
  return data ?? EMPTY;
}
