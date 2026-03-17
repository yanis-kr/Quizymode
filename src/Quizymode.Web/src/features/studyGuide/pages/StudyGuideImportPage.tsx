import * as React from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import {
  studyGuidesApi,
  studyGuideImportApi,
  type ImportSessionResponse,
} from "@/api/studyGuides";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

type Step = 1 | 2 | 3 | 4;

const StudyGuideImportPage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialSessionId = searchParams.get("sessionId") ?? "";

  const [step, setStep] = React.useState<Step>(1);
  const [sessionId, setSessionId] = React.useState(initialSessionId);
  const [categoryName, setCategoryName] = React.useState("");
  const [rank1Name, setRank1Name] = React.useState("");
  const [rank2Name, setRank2Name] = React.useState("");
  const [defaultKeywordsText, setDefaultKeywordsText] = React.useState("");
  const [targetItemsPerChunk, setTargetItemsPerChunk] = React.useState(15);
  const [chunkResponses, setChunkResponses] = React.useState<Record<number, string>>({});
  const [dedupResponse, setDedupResponse] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);

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
  const categoryOptions = [...categories].sort((a, b) => a.category.localeCompare(b.category));

  const {
    data: rank1Data,
    isLoading: isLoadingRank1,
  } = useQuery({
    queryKey: ["keywords", "rank1", categoryName],
    queryFn: () => keywordsApi.getNavigationKeywords(categoryName, []),
    enabled: !!isAuthenticated && !!categoryName.trim(),
  });
  const rank1Keywords = isLoadingRank1
    ? []
    : (rank1Data?.keywords ?? []).filter((k) => k.name.toLowerCase() !== "other");

  const {
    data: rank2Data,
    isLoading: isLoadingRank2,
  } = useQuery({
    queryKey: ["keywords", "rank2", categoryName, rank1Name],
    queryFn: () =>
      keywordsApi.getNavigationKeywords(categoryName, rank1Name ? [rank1Name] : []),
    enabled: !!isAuthenticated && !!categoryName.trim() && !!rank1Name.trim(),
  });
  const rank2Keywords = isLoadingRank2 ? [] : (rank2Data?.keywords ?? []);

  const {
    data: session,
    isLoading: isLoadingSession,
    refetch: refetchSession,
  } = useQuery<ImportSessionResponse | undefined>({
    queryKey: ["studyGuideImportSession", sessionId],
    queryFn: async () => {
      if (!sessionId) return undefined;
      return await studyGuideImportApi.getSession(sessionId);
    },
    enabled: !!isAuthenticated && !!sessionId,
  });

  const createSessionMutation = useMutation({
    mutationFn: studyGuideImportApi.createSession,
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setStep(2);
      queryClient.invalidateQueries({ queryKey: ["studyGuideImportSession", data.sessionId] });
      setLocalError(null);
    },
    onError: () => {
      setLocalError("Failed to create import session. Check that you have a study guide saved.");
    },
  });

  const generateChunksMutation = useMutation({
    mutationFn: (id: string) => studyGuideImportApi.generateChunks(id),
    onSuccess: async () => {
      await refetchSession();
      setStep(2);
    },
    onError: () => {
      setLocalError("Failed to generate chunks.");
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
    onError: () => {
      setLocalError("Failed to validate chunk response.");
    },
  });

  const submitDedupMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      studyGuideImportApi.submitDedupResult(id, text),
    onSuccess: async () => {
      await refetchSession();
      setLocalError(null);
    },
    onError: () => {
      setLocalError("Failed to validate dedup response.");
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (id: string) => studyGuideImportApi.finalize(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      setStep(4);
      setLocalError(null);
      // Optional: show a toast; for now just log.
      console.info("Finalize import result:", data);
    },
    onError: () => {
      setLocalError("Failed to finalize import.");
    },
  });

  React.useEffect(() => {
    if (!categoryName && categories.length > 0) {
      setCategoryName(categories[0].category);
    }
  }, [categories, categoryName]);

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guide) {
      setLocalError("You must save a study guide before starting import.");
      return;
    }
    if (!categoryName.trim()) {
      setLocalError("Select a category.");
      return;
    }
    const navPath = [rank1Name, rank2Name].filter(Boolean);
    const defaultKeywords = defaultKeywordsText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    createSessionMutation.mutate({
      categoryName,
      navigationKeywordPath: navPath,
      defaultKeywords: defaultKeywords.length ? defaultKeywords : undefined,
      targetItemsPerChunk,
    });
  };

  const handleCopyPrompt = (promptText: string) => {
    navigator.clipboard.writeText(promptText);
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
    session && session.chunks.length > 1 && session.promptResults.some((r) => r.validationStatus === "Valid");

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoadingGuide) {
    return <LoadingSpinner />;
  }

  if (!guide) {
    return (
      <div className="px-4 py-6 sm:px-0 max-w-3xl mx-auto">
        <ErrorMessage message="You do not have a study guide yet. Create one first." />
        <button
          type="button"
          onClick={() => navigate("/study-guide")}
          className="mt-4 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50"
        >
          Go to Study Guide
        </button>
      </div>
    );
  }

  const renderStepIndicator = () => (
    <div className="flex items-center gap-3 text-sm mb-4">
      {["Guide", "Prompts", "Dedup", "Import"].map((label, index) => {
        const s = (index + 1) as Step;
        const active = step === s;
        return (
          <div key={label} className="flex items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                active ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700"
              }`}
            >
              {s}
            </div>
            <span className={active ? "font-medium text-gray-900" : "text-gray-500"}>{label}</span>
            {s < 4 && <span className="text-gray-300 mx-1">/</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="px-4 py-6 sm:px-0 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Generate Items from Study Guide</h1>
      <p className="text-gray-600 text-sm mb-4">
        Use your saved study guide to generate prompts, paste AI responses, validate JSON, and import items as
        private questions.
      </p>

      {renderStepIndicator()}

      {localError && (
        <div className="mb-4">
          <ErrorMessage message={localError} onRetry={() => setLocalError(null)} />
        </div>
      )}

      {step === 1 && (
        <form onSubmit={handleCreateSession} className="space-y-4 bg-white p-4 rounded-lg shadow">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">1. Session setup</h2>
          <p className="text-xs text-gray-500 mb-3">
            Choose where the items should live (category and navigation path). These apply to all imported items.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                value={categoryName}
                onChange={(e) => {
                  setCategoryName(e.target.value);
                  setRank1Name("");
                  setRank2Name("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">Select a category</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.category} value={cat.category}>
                    {cat.category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Primary keyword (rank 1)</label>
              <select
                value={rank1Name}
                onChange={(e) => {
                  setRank1Name(e.target.value);
                  setRank2Name("");
                }}
                disabled={!categoryName || isLoadingRank1}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">Optional</option>
                {rank1Keywords.map((k) => (
                  <option key={k.name} value={k.name}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtopic (rank 2)</label>
              <select
                value={rank2Name}
                onChange={(e) => setRank2Name(e.target.value)}
                disabled={!rank1Name || isLoadingRank2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">Optional</option>
                {rank2Keywords.map((k) => (
                  <option key={k.name} value={k.name}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default extra keywords (comma-separated, optional)
              </label>
              <input
                type="text"
                value={defaultKeywordsText}
                onChange={(e) => setDefaultKeywordsText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="e.g. practice, mock, exam"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target items per chunk (5–50)
              </label>
              <input
                type="number"
                min={5}
                max={50}
                value={targetItemsPerChunk}
                onChange={(e) => setTargetItemsPerChunk(Number(e.target.value) || 15)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              disabled={createSessionMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {createSessionMutation.isPending ? "Creating..." : "Create session & generate prompts"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/study-guide")}
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
            <h2 className="text-sm font-semibold text-gray-800">2. Prompts & chunk results</h2>
            <button
              type="button"
              onClick={() => generateChunksMutation.mutate(sessionId)}
              disabled={generateChunksMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {generateChunksMutation.isPending ? "Regenerating..." : "Regenerate chunks"}
            </button>
          </div>
          {isLoadingSession && <LoadingSpinner />}
          {session && (
            <div className="space-y-4">
              {session.chunks.length === 0 && (
                <p className="text-xs text-gray-500">
                  No chunks yet. Click &quot;Regenerate chunks&quot; to create prompts from your study guide.
                </p>
              )}
              {session.chunks.map((chunk) => {
                const result = session.promptResults.find((r) => r.chunkIndex === chunk.chunkIndex);
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
                          Chunk {chunk.chunkIndex + 1}: {chunk.title}
                        </div>
                        <div className="text-xs text-gray-500">
                          {chunk.sizeBytes.toLocaleString()} bytes of source text
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
                        Paste AI JSON response for this prompt
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
                        <div className="text-xs text-red-600">
                          {messages.join(" ")}
                        </div>
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
          <h2 className="text-sm font-semibold text-gray-800">3. Optional final dedup prompt</h2>
          <p className="text-xs text-gray-500 mb-1">
            For multi-chunk sessions, you can run one more AI pass to merge duplicates and near-duplicates.
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
              Dedup prompt will appear here after you have validated responses for at least one chunk.
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

      {step >= 2 && sessionId && (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Back to setup
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            Review prompts
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
            disabled={finalizeMutation.isPending}
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
            Your items have been imported as private questions under <span className="font-semibold">{categoryName}</span>.
          </p>
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

