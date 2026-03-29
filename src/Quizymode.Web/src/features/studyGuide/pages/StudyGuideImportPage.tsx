import * as React from "react";
import { isAxiosError } from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import {
  studyGuidesApi,
  studyGuideImportApi,
  type ImportSessionResponse,
  type FinalizeImportResponse,
} from "@/api/studyGuides";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { ItemTopicScopeFields } from "@/components/items/ItemTopicScopeFields";
import {
  keywordsParamFromScope,
  parseKeywordsParam,
} from "@/utils/addItemsScopeUrl";
import { validateNavigationKeywordName } from "@/utils/navigationKeywordRules";
import ContentComplianceNotice from "@/features/legal/components/ContentComplianceNotice";

type Step = 1 | 2 | 3 | 4;

function clampTargetSetCount(rawValue: string | null): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(6, parsed));
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const data = error.response?.data;
  if (Array.isArray(data)) {
    const firstMessage = data
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          return (
            ("message" in entry && typeof entry.message === "string" && entry.message) ||
            ("errorMessage" in entry &&
              typeof entry.errorMessage === "string" &&
              entry.errorMessage) ||
            ("description" in entry &&
              typeof entry.description === "string" &&
              entry.description) ||
            ""
          );
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
    return firstMessage || error.message || fallback;
  }

  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data && typeof data === "object") {
    const maybeDetail =
      ("detail" in data && typeof data.detail === "string" && data.detail) ||
      ("description" in data && typeof data.description === "string" && data.description) ||
      ("title" in data && typeof data.title === "string" && data.title) ||
      "";
    if (maybeDetail) return maybeDetail;
  }

  return error.message || fallback;
}

const StudyGuideImportPage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSessionId = searchParams.get("sessionId")?.trim() ?? "";
  const initialCategory = searchParams.get("category")?.trim() ?? "";
  const initialTargetSetCount = clampTargetSetCount(searchParams.get("sets"));
  const initialKeywords = React.useMemo(
    () => parseKeywordsParam(searchParams.get("keywords")),
    [searchParams]
  );

  const [step, setStep] = React.useState<Step>(initialSessionId ? 2 : 1);
  const [sessionId, setSessionId] = React.useState(initialSessionId);
  const [categoryName, setCategoryName] = React.useState(initialCategory);
  const [rank1Name, setRank1Name] = React.useState(initialKeywords.rank1);
  const [rank2Name, setRank2Name] = React.useState(initialKeywords.rank2);
  const [defaultKeywordsText, setDefaultKeywordsText] = React.useState(
    initialKeywords.extrasJoined
  );
  const [targetSetCount, setTargetSetCount] = React.useState(initialTargetSetCount);
  const [chunkResponses, setChunkResponses] = React.useState<Record<number, string>>({});
  const [dedupResponse, setDedupResponse] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [finalizeSummary, setFinalizeSummary] = React.useState<FinalizeImportResponse | null>(null);

  const hydratedSessionRef = React.useRef<string>("");

  const { data: guide, isLoading: isLoadingGuide } = useQuery({
    queryKey: ["studyGuide", "current"],
    queryFn: () => studyGuidesApi.getCurrent(),
    enabled: isAuthenticated,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: isAuthenticated,
  });
  const categories = categoriesData?.categories ?? [];
  const categoryOptions = React.useMemo(
    () => [...categories].sort((a, b) => a.category.localeCompare(b.category)),
    [categories]
  );

  const { data: rank1Data, isLoading: isLoadingRank1 } = useQuery({
    queryKey: ["keywords", "rank1", categoryName],
    queryFn: () => keywordsApi.getNavigationKeywords(categoryName, []),
    enabled: !!isAuthenticated && !!categoryName.trim(),
  });
  const rank1Options = (rank1Data?.keywords ?? [])
    .filter((keyword) => keyword.name.toLowerCase() !== "other")
    .map((keyword) => keyword.name);

  const { data: rank2Data, isLoading: isLoadingRank2 } = useQuery({
    queryKey: ["keywords", "rank2", categoryName, rank1Name],
    queryFn: () =>
      keywordsApi.getNavigationKeywords(categoryName, rank1Name ? [rank1Name] : []),
    enabled: !!isAuthenticated && !!categoryName.trim() && !!rank1Name.trim(),
  });
  const rank2Options = (rank2Data?.keywords ?? []).map((keyword) => keyword.name);

  const {
    data: session,
    isLoading: isLoadingSession,
    refetch: refetchSession,
  } = useQuery<ImportSessionResponse | undefined>({
    queryKey: ["studyGuideImportSession", sessionId],
    queryFn: async () => {
      if (!sessionId) return undefined;
      return studyGuideImportApi.getSession(sessionId);
    },
    enabled: !!isAuthenticated && !!sessionId,
  });

  const buildPageSearchParams = React.useCallback(
    (nextSessionId: string, nextCategory: string, nextRank1: string, nextRank2: string, nextExtras: string, nextSetCount: number) => {
      const params = new URLSearchParams();
      if (nextSessionId.trim()) params.set("sessionId", nextSessionId.trim());
      if (nextCategory.trim()) params.set("category", nextCategory.trim());
      const keywords = keywordsParamFromScope(nextRank1, nextRank2, nextExtras);
      if (keywords) params.set("keywords", keywords);
      params.set("sets", String(Math.max(1, Math.min(6, nextSetCount))));
      return params;
    },
    []
  );

  const buildStudyGuideUrl = React.useCallback(() => {
    const params = buildPageSearchParams(
      "",
      categoryName,
      rank1Name,
      rank2Name,
      defaultKeywordsText,
      targetSetCount
    );
    const query = params.toString();
    return query ? `/study-guide?${query}` : "/study-guide";
  }, [
    buildPageSearchParams,
    categoryName,
    rank1Name,
    rank2Name,
    defaultKeywordsText,
    targetSetCount,
  ]);

  React.useEffect(() => {
    if (sessionId) return;
    if (!categoryName && categoryOptions.length > 0) {
      setCategoryName(categoryOptions[0].category);
    }
  }, [categoryName, categoryOptions, sessionId]);

  React.useEffect(() => {
    if (!session || !sessionId) return;
    if (hydratedSessionRef.current === sessionId) return;

    hydratedSessionRef.current = sessionId;
    setCategoryName(session.categoryName);
    setRank1Name(session.navigationKeywordPath[0] ?? "");
    setRank2Name(session.navigationKeywordPath[1] ?? "");
    setDefaultKeywordsText((session.defaultKeywords ?? []).join(", "));
    setTargetSetCount(Math.max(1, Math.min(6, session.targetSetCount)));
    setStep(session.status === "Completed" ? 4 : 2);
  }, [session, sessionId]);

  React.useEffect(() => {
    if (!sessionId) {
      hydratedSessionRef.current = "";
    }
  }, [sessionId]);

  React.useEffect(() => {
    const nextParams = buildPageSearchParams(
      sessionId,
      categoryName,
      rank1Name,
      rank2Name,
      defaultKeywordsText,
      targetSetCount
    );
    const next = nextParams.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    buildPageSearchParams,
    categoryName,
    defaultKeywordsText,
    rank1Name,
    rank2Name,
    searchParams,
    sessionId,
    setSearchParams,
    targetSetCount,
  ]);

  const generateChunksMutation = useMutation({
    mutationFn: (id: string) => studyGuideImportApi.generateChunks(id),
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({
        queryKey: ["studyGuideImportSession", id],
      });
      await refetchSession();
      setChunkResponses({});
      setDedupResponse("");
      setFinalizeSummary(null);
      setStep(2);
      setLocalError(null);
    },
    onError: (error: unknown) => {
      setLocalError(getApiErrorMessage(error, "Failed to generate prompt sets."));
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: studyGuideImportApi.createSession,
    onSuccess: async (data) => {
      hydratedSessionRef.current = "";
      setSessionId(data.sessionId);
      setChunkResponses({});
      setDedupResponse("");
      setFinalizeSummary(null);
      setStep(2);
      setLocalError(null);
      await queryClient.invalidateQueries({
        queryKey: ["studyGuideImportSession", data.sessionId],
      });
      generateChunksMutation.mutate(data.sessionId);
    },
    onError: (error: unknown) => {
      setLocalError(
        getApiErrorMessage(
          error,
          "Failed to create prompt-set session. Check that you have a study guide saved."
        )
      );
    },
  });

  const submitChunkMutation = useMutation({
    mutationFn: ({
      id,
      chunkIndex,
      rawResponseText,
    }: {
      id: string;
      chunkIndex: number;
      rawResponseText: string;
    }) => studyGuideImportApi.submitChunkResult(id, chunkIndex, rawResponseText),
    onSuccess: async () => {
      await refetchSession();
      setLocalError(null);
    },
    onError: (error: unknown) => {
      setLocalError(getApiErrorMessage(error, "Failed to validate prompt-set response."));
    },
  });

  const submitDedupMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      studyGuideImportApi.submitDedupResult(id, text),
    onSuccess: async () => {
      await refetchSession();
      setLocalError(null);
    },
    onError: (error: unknown) => {
      setLocalError(getApiErrorMessage(error, "Failed to validate dedup response."));
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (id: string) => studyGuideImportApi.finalize(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      setFinalizeSummary(data);
      setStep(4);
      setLocalError(null);
    },
    onError: (error: unknown) => {
      setLocalError(getApiErrorMessage(error, "Failed to finalize import."));
    },
  });

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!guide) {
      setLocalError("You must save a study guide before creating prompt sets.");
      return;
    }
    if (!categoryName.trim()) {
      setLocalError("Select a category.");
      return;
    }
    if (!rank1Name.trim() || !rank2Name.trim()) {
      setLocalError("Primary topic (rank 1) and subtopic (rank 2) are required.");
      return;
    }

    const navError =
      validateNavigationKeywordName(rank1Name) ??
      validateNavigationKeywordName(rank2Name);
    if (navError) {
      setLocalError(navError);
      return;
    }

    const defaultKeywords = defaultKeywordsText
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    createSessionMutation.mutate({
      categoryName: categoryName.trim(),
      navigationKeywordPath: [rank1Name.trim(), rank2Name.trim()],
      defaultKeywords: defaultKeywords.length > 0 ? defaultKeywords : undefined,
      targetSetCount,
    });
  };

  const handleCopyPrompt = async (promptText: string) => {
    try {
      await navigator.clipboard.writeText(promptText);
    } catch (error) {
      console.error("Failed to copy prompt text:", error);
    }
  };

  const handleValidateChunk = (chunkIndex: number) => {
    if (!sessionId) return;
    const text = chunkResponses[chunkIndex] ?? "";
    submitChunkMutation.mutate({ id: sessionId, chunkIndex, rawResponseText: text });
  };

  const handleValidateDedup = () => {
    if (!sessionId) return;
    submitDedupMutation.mutate({ id: sessionId, text: dedupResponse });
  };

  const canShowDedupStep =
    !!session &&
    session.chunks.length > 1 &&
    session.promptResults.some((result) => result.validationStatus === "Valid");
  const hasValidImportSource =
    !!session &&
    (session.promptResults.some((result) => result.validationStatus === "Valid") ||
      session.dedupResult?.validationStatus === "Valid");

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoadingGuide) {
    return <LoadingSpinner />;
  }

  if (!guide) {
    return (
      <div className="px-4 py-6 sm:px-0 max-w-3xl mx-auto">
        <ErrorMessage message="You do not have a study guide yet. Save one first, then return to prompt sets." />
        <button
          type="button"
          onClick={() => navigate(buildStudyGuideUrl())}
          className="mt-4 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50"
        >
          Go to Study Guide
        </button>
      </div>
    );
  }

  const renderStepIndicator = () => (
    <div className="flex items-center gap-3 text-sm mb-4">
      {["Scope", "Prompt Sets", "Dedup", "Import"].map((label, index) => {
        const currentStep = (index + 1) as Step;
        const active = step === currentStep;
        return (
          <div key={label} className="flex items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                active ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700"
              }`}
            >
              {currentStep}
            </div>
            <span className={active ? "font-medium text-gray-900" : "text-gray-500"}>
              {label}
            </span>
            {currentStep < 4 && <span className="text-gray-300 mx-1">/</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="px-4 py-6 sm:px-0 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Generate AI Sets from Study Guide
      </h1>
      <p className="text-gray-600 text-sm mb-4">
        Use your uploaded study guide to create a chosen number of prompt sets. Each prompt set asks
        AI for 10-15 new private items for the selected category, topic path, and extra keywords.
      </p>

      <ContentComplianceNotice />

      {renderStepIndicator()}

      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
        Using study guide: <span className="font-medium text-slate-900">{guide.title}</span>
      </div>

      {localError && (
        <div className="mb-4">
          <ErrorMessage message={localError} onRetry={() => setLocalError(null)} />
        </div>
      )}

      {step === 1 && (
        <form onSubmit={handleCreateSession} className="space-y-4 bg-white p-4 rounded-lg shadow">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">1. Scope and set count</h2>
          <p className="text-xs text-gray-500 mb-3">
            Choose where the imported private items should live, then choose how many AI prompt sets
            to generate from your study guide.
          </p>

          <section className="rounded-lg border border-gray-200 bg-slate-50/80 p-4 sm:p-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Topic and tags</h3>
              <p className="mt-1 text-xs text-gray-500">
                Category, primary topic, and subtopic are required. Optional extra keywords are
                attached to every imported item and included in each prompt set.
              </p>
            </div>
            <ItemTopicScopeFields
              idPrefix="study-guide-import-scope"
              categories={categoryOptions}
              category={categoryName}
              rank1={rank1Name}
              rank2={rank2Name}
              onScopeChange={(patch) => {
                if (patch.category !== undefined) {
                  setCategoryName(patch.category);
                  setRank1Name("");
                  setRank2Name("");
                  return;
                }
                if (patch.rank1 !== undefined) {
                  setRank1Name(patch.rank1);
                  setRank2Name("");
                }
                if (patch.rank2 !== undefined) {
                  setRank2Name(patch.rank2);
                }
              }}
              rank1Options={rank1Options}
              rank2Options={rank2Options}
              isLoadingRank1={isLoadingRank1}
              isLoadingRank2={isLoadingRank2}
            />
            <div className="pt-4 border-t border-gray-200/90">
              <label
                htmlFor="study-guide-import-default-keywords"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Additional keywords (comma-separated, optional)
              </label>
              <input
                id="study-guide-import-default-keywords"
                type="text"
                value={defaultKeywordsText}
                onChange={(e) => setDefaultKeywordsText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                placeholder="e.g. exam-prep, practice"
              />
              <p className="mt-1 text-xs text-gray-500">
                These keywords are added to every imported item and included in each AI prompt set.
              </p>
            </div>
          </section>

          <div className="max-w-xs">
            <label
              htmlFor="study-guide-import-target-set-count"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Number of prompt sets (1-6)
            </label>
            <input
              id="study-guide-import-target-set-count"
              type="number"
              min={1}
              max={6}
              value={targetSetCount}
              onChange={(e) => setTargetSetCount(clampTargetSetCount(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Each prompt set asks AI for 10-15 new private items.
            </p>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              disabled={createSessionMutation.isPending || generateChunksMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {createSessionMutation.isPending || generateChunksMutation.isPending
                ? "Generating prompt sets..."
                : "Create prompt sets"}
            </button>
            <button
              type="button"
              onClick={() => navigate(buildStudyGuideUrl())}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Back to Study Guide
            </button>
          </div>
        </form>
      )}

      {step >= 2 && sessionId && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              2. Prompt sets
              {session?.chunks?.length ? ` (${session.chunks.length})` : ""}
            </h2>
            <button
              type="button"
              onClick={() => generateChunksMutation.mutate(sessionId)}
              disabled={generateChunksMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {generateChunksMutation.isPending ? "Regenerating..." : "Regenerate prompt sets"}
            </button>
          </div>

          {(isLoadingSession || generateChunksMutation.isPending) && !session?.chunks?.length && (
            <LoadingSpinner />
          )}

          {session && (
            <div className="space-y-4">
              {session.chunks.length === 0 && (
                <p className="text-xs text-gray-500">
                  No prompt sets yet. Click &quot;Regenerate prompt sets&quot; to build prompts from your study guide.
                </p>
              )}

              {session.chunks.map((chunk) => {
                const result = session.promptResults.find(
                  (promptResult) => promptResult.chunkIndex === chunk.chunkIndex
                );
                const status = result?.validationStatus ?? "NotStarted";
                const messages: string[] =
                  result?.validationMessagesJson && result.validationMessagesJson.length > 0
                    ? JSON.parse(result.validationMessagesJson)
                    : [];

                return (
                  <div
                    key={chunk.id}
                    className="border border-gray-200 rounded-lg p-3 bg-white space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {chunk.title}
                        </div>
                        <div className="text-xs text-gray-500">
                          {chunk.sizeBytes.toLocaleString()} bytes of study guide content
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyPrompt(chunk.promptText)}
                          className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
                        >
                          Copy prompt
                        </button>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            status === "Valid"
                              ? "bg-emerald-100 text-emerald-800"
                              : status === "Invalid"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {status === "Valid"
                            ? "Validated"
                            : status === "Invalid"
                            ? "Invalid"
                            : "Not validated"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Paste AI JSON response for this prompt set
                      </label>
                      <textarea
                        rows={5}
                        value={chunkResponses[chunk.chunkIndex] ?? ""}
                        onChange={(e) =>
                          setChunkResponses((prev) => ({
                            ...prev,
                            [chunk.chunkIndex]: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono"
                        placeholder="Paste the raw JSON array returned by ChatGPT or another assistant..."
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleValidateChunk(chunk.chunkIndex)}
                        disabled={submitChunkMutation.isPending}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {submitChunkMutation.isPending ? "Validating..." : "Validate JSON"}
                      </button>
                      {messages.length > 0 && (
                        <div className="text-xs text-red-600">{messages.join(" ")}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step >= 3 && session && canShowDedupStep && (
        <div className="mt-6 space-y-3 bg-white p-4 rounded-lg shadow">
          <h2 className="text-sm font-semibold text-gray-800">3. Optional dedup pass</h2>
          <p className="text-xs text-gray-500 mb-1">
            If multiple prompt sets overlap, run one more AI pass to merge duplicates and near-duplicates before import.
          </p>
          {session.dedupResult?.dedupPromptText ? (
            <>
              <div className="border border-gray-200 rounded-md p-2 bg-gray-50 max-h-48 overflow-auto text-xs font-mono whitespace-pre-wrap">
                {session.dedupResult.dedupPromptText}
              </div>
              <button
                type="button"
                onClick={() => handleCopyPrompt(session.dedupResult!.dedupPromptText!)}
                className="mt-2 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
              >
                Copy dedup prompt
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-500">
              The dedup prompt appears after you validate at least one prompt-set response.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Paste deduplicated JSON array (optional)
            </label>
            <textarea
              rows={5}
              value={dedupResponse}
              onChange={(e) => setDedupResponse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono"
              placeholder="Paste the raw JSON array returned by the dedup prompt..."
            />
          </div>
          <button
            type="button"
            onClick={handleValidateDedup}
            disabled={submitDedupMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitDedupMutation.isPending ? "Validating..." : "Validate dedup JSON"}
          </button>
        </div>
      )}

      {step >= 2 && step !== 4 && sessionId && (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Back to scope
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            Review prompt sets
          </button>
          {canShowDedupStep && (
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
            >
              Dedup
            </button>
          )}
          <button
            type="button"
            onClick={() => finalizeMutation.mutate(sessionId)}
            disabled={finalizeMutation.isPending || !hasValidImportSource}
            className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {finalizeMutation.isPending ? "Importing..." : "Finalize import"}
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-900">
          <h2 className="font-semibold mb-1">Import completed</h2>
          <p className="mb-2">
            Your items have been imported as private questions under{" "}
            <span className="font-semibold">{categoryName}</span>.
          </p>
          {finalizeSummary && (
            <p className="mb-3 text-xs text-emerald-800">
              Created {finalizeSummary.createdCount}, skipped {finalizeSummary.duplicateCount} duplicates, failed {finalizeSummary.failedCount}.
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate("/categories")}
            className="px-4 py-2 text-xs font-medium text-emerald-700 bg-white border border-emerald-300 rounded-md hover:bg-emerald-50"
          >
            Go to Categories
          </button>
        </div>
      )}
    </div>
  );
};

export default StudyGuideImportPage;
