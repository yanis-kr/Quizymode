import * as React from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import {
  studyGuideUploadsApi,
  type AcceptStudyGuideUploadResponse,
  type CreateStudyGuideUploadRequest,
  type StudyGuideUploadResponse,
} from "@/api/studyGuideUploads";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { ItemTopicScopeFields } from "@/components/items/ItemTopicScopeFields";
import ContentComplianceNotice from "@/features/legal/components/ContentComplianceNotice";
import { buildCategoryPath, categoryNameToSlug } from "@/utils/categorySlug";
import {
  STUDY_GUIDE_UPLOAD_MAX_BYTES,
  parseKeywordsInput,
  utf8ByteLength,
  validateStudyGuideUploadForm,
} from "../studyGuideUploadSchema";

const POLL_INTERVAL_MS = 2000;
const UNAVAILABLE_MESSAGE =
  "AI study guide upload is unavailable right now. Please try again later.";

function getUploadErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : "Something went wrong.";
  }

  const status = error.response?.status;
  if (status === 503) return UNAVAILABLE_MESSAGE;
  if (status === 429) return "You have uploaded several study guides recently. Please wait a while and try again.";

  const data: unknown = error.response?.data;
  if (Array.isArray(data)) {
    const first = data.find(
      (entry): entry is { errorMessage: string } =>
        !!entry && typeof entry === "object" && typeof (entry as { errorMessage?: unknown }).errorMessage === "string"
    );
    if (first) return first.errorMessage;
  }
  if (data && typeof data === "object") {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return error.message || "Something went wrong.";
}

const StudyGuideUploadPage = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const uploadId = searchParams.get("id")?.trim() ?? "";

  const [text, setText] = React.useState("");
  const [categoryName, setCategoryName] = React.useState("");
  const [rank1Name, setRank1Name] = React.useState("");
  const [rank2Name, setRank2Name] = React.useState("");
  const [keywordsText, setKeywordsText] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = React.useState(false);
  const [forcedUnavailable, setForcedUnavailable] = React.useState(false);
  const [deselected, setDeselected] = React.useState<Set<number>>(new Set());
  const [acceptSummary, setAcceptSummary] = React.useState<AcceptStudyGuideUploadResponse | null>(null);

  const { data: config, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["studyGuideUploads", "config"],
    queryFn: () => studyGuideUploadsApi.getConfig(),
    enabled: isAuthenticated,
  });
  const maxBytes = config?.maxTextBytes ?? STUDY_GUIDE_UPLOAD_MAX_BYTES;
  const isEnabled = !!config?.enabled && !forcedUnavailable;

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: isAuthenticated && isEnabled,
  });
  const categoryOptions = React.useMemo(
    () => [...(categoriesData?.categories ?? [])].sort((a, b) => a.category.localeCompare(b.category)),
    [categoriesData]
  );

  const { data: rank1Data, isLoading: isLoadingRank1 } = useQuery({
    queryKey: ["keywords", "rank1", categoryName],
    queryFn: () => keywordsApi.getNavigationKeywords(categoryName, []),
    enabled: isAuthenticated && isEnabled && !!categoryName.trim(),
  });
  const rank1Options = (rank1Data?.keywords ?? [])
    .filter((keyword) => keyword.name.toLowerCase() !== "other")
    .map((keyword) => keyword.name);

  const { data: rank2Data, isLoading: isLoadingRank2 } = useQuery({
    queryKey: ["keywords", "rank2", categoryName, rank1Name],
    queryFn: () => keywordsApi.getNavigationKeywords(categoryName, rank1Name ? [rank1Name] : []),
    enabled: isAuthenticated && isEnabled && !!categoryName.trim() && !!rank1Name.trim(),
  });
  const rank2Options = (rank2Data?.keywords ?? []).map((keyword) => keyword.name);

  const {
    data: upload,
    isLoading: isLoadingUpload,
    error: uploadError,
  } = useQuery<StudyGuideUploadResponse>({
    queryKey: ["studyGuideUploads", uploadId],
    queryFn: () => studyGuideUploadsApi.get(uploadId),
    enabled: isAuthenticated && !!uploadId,
    refetchInterval: (query) =>
      query.state.data?.status === "Pending" ? POLL_INTERVAL_MS : false,
  });

  const createMutation = useMutation({
    mutationFn: (request: CreateStudyGuideUploadRequest) => studyGuideUploadsApi.create(request),
    onSuccess: (response) => {
      setDuplicateNotice(response.isDuplicate);
      setDeselected(new Set());
      setAcceptSummary(null);
      void queryClient.invalidateQueries({ queryKey: ["studyGuideUploads", response.id] });
      setSearchParams({ id: response.id });
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 503) {
        setForcedUnavailable(true);
      }
      setFormError(getUploadErrorMessage(error));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: ({ id, indexes }: { id: string; indexes: number[] }) =>
      studyGuideUploadsApi.accept(id, indexes),
    onSuccess: (response) => {
      setAcceptSummary(response);
      void queryClient.invalidateQueries({ queryKey: ["studyGuideUploads", uploadId] });
    },
    onError: (error) => setFormError(getUploadErrorMessage(error)),
  });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const byteCount = utf8ByteLength(text);
  const overLimit = byteCount > maxBytes;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const form = {
      text,
      category: categoryName,
      navigationKeyword1: rank1Name,
      navigationKeyword2: rank2Name,
      keywords: parseKeywordsInput(keywordsText),
    };
    const validationError = validateStudyGuideUploadForm(form, maxBytes);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    createMutation.mutate(form);
  };

  const startOver = () => {
    setSearchParams({});
    setDuplicateNotice(false);
    setAcceptSummary(null);
    setDeselected(new Set());
    setFormError(null);
  };

  const toggleQuestion = (index: number) => {
    setDeselected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const renderResult = () => {
    if (isLoadingUpload) return <LoadingSpinner />;
    if (uploadError || !upload) {
      return (
        <div className="space-y-3">
          <ErrorMessage message="This upload could not be found." />
          <button type="button" onClick={startOver} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Start a new upload
          </button>
        </div>
      );
    }

    if (upload.status === "Pending") {
      return (
        <div role="status" className="rounded-lg bg-white p-6 shadow text-center space-y-3">
          <LoadingSpinner />
          <p className="text-sm font-medium text-gray-900">Generating questions…</p>
          <p className="text-xs text-gray-500">
            This usually takes under a minute. You can leave this page and come back with the same link.
          </p>
        </div>
      );
    }

    if (upload.status === "Failed") {
      return (
        <div className="space-y-3">
          <ErrorMessage message={upload.error || "Question generation failed."} />
          <p className="text-sm text-gray-600">
            Submitting the same text again will retry generation.
          </p>
          <button type="button" onClick={startOver} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Try again
          </button>
        </div>
      );
    }

    const selectedIndexes = upload.questions
      .map((_, index) => index)
      .filter((index) => !deselected.has(index));
    const categoryPath = buildCategoryPath(categoryNameToSlug(upload.category), [
      upload.navigationKeyword1,
      upload.navigationKeyword2,
    ]);
    const accepted = !!upload.acceptedUtc || !!acceptSummary;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {upload.questions.length} generated question{upload.questions.length === 1 ? "" : "s"}
          </h2>
          <span className="text-xs text-gray-500">
            {upload.category} / {upload.navigationKeyword1} / {upload.navigationKeyword2}
          </span>
        </div>

        {accepted ? (
          <div className="rounded-md bg-green-50 p-4 text-sm text-green-800" role="status">
            {acceptSummary
              ? `Added ${acceptSummary.createdCount} item${acceptSummary.createdCount === 1 ? "" : "s"} to your private items` +
                (acceptSummary.duplicateCount > 0 ? ` (${acceptSummary.duplicateCount} duplicate${acceptSummary.duplicateCount === 1 ? "" : "s"} skipped)` : "") +
                "."
              : `These questions were already added to your private items (${upload.createdItemCount ?? 0} created).`}{" "}
            <Link to={categoryPath} className="font-medium underline">
              View topic
            </Link>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            Review the questions for accuracy. Uncheck any you do not want, then add the rest as private items.
          </p>
        )}

        <ol className="space-y-3">
          {upload.questions.map((question, index) => (
            <li key={index} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <label className="flex items-start gap-3">
                {!accepted && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={!deselected.has(index)}
                    onChange={() => toggleQuestion(index)}
                    aria-label={`Include question ${index + 1}`}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-medium text-gray-900">
                    {index + 1}. {question.question}
                  </p>
                  <ul className="space-y-1 text-sm">
                    <li className="text-green-700">✓ {question.correctAnswer}</li>
                    {question.incorrectAnswers.map((answer, answerIndex) => (
                      <li key={answerIndex} className="text-gray-600">
                        ✗ {answer}
                      </li>
                    ))}
                  </ul>
                  {question.explanation && (
                    <p className="text-xs text-gray-500">{question.explanation}</p>
                  )}
                </div>
              </label>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-3">
          {!accepted && (
            <button
              type="button"
              disabled={selectedIndexes.length === 0 || acceptMutation.isPending}
              onClick={() => acceptMutation.mutate({ id: upload.id, indexes: selectedIndexes })}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {acceptMutation.isPending
                ? "Adding…"
                : `Add ${selectedIndexes.length} selected to my items`}
            </button>
          )}
          <button
            type="button"
            onClick={startOver}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Upload another study guide
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-0 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Generate Quiz from Study Guide</h1>
      <p className="text-gray-600 text-sm mb-4">
        Paste up to {Math.round(maxBytes / 1024)} KB of notes and get up to {config?.maxQuestions ?? 20}{" "}
        multiple-choice questions generated by AI. You review them before anything is saved.
      </p>

      <ContentComplianceNotice />

      {formError && (
        <div className="mb-4">
          <ErrorMessage message={formError} onRetry={() => setFormError(null)} />
        </div>
      )}

      {isLoadingConfig ? (
        <LoadingSpinner />
      ) : uploadId ? (
        <>
          {duplicateNotice && (
            <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800" role="status">
              You already uploaded this study guide, so here is the existing result.
            </div>
          )}
          {renderResult()}
        </>
      ) : !isEnabled ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-2" role="status">
          <h2 className="text-sm font-semibold text-gray-900">Feature unavailable</h2>
          <p className="text-sm text-gray-600">{UNAVAILABLE_MESSAGE}</p>
          <p className="text-sm text-gray-600">
            You can still{" "}
            <Link to="/study-guide" className="font-medium text-indigo-600 hover:text-indigo-800">
              build sets from a study guide manually
            </Link>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 bg-white p-4 rounded-lg shadow" noValidate>
          <div>
            <label htmlFor="study-guide-upload-text" className="block text-sm font-medium text-gray-700 mb-1">
              Study guide text *
            </label>
            <textarea
              id="study-guide-upload-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              placeholder="Paste your notes, a chapter summary, or a study guide…"
              aria-describedby="study-guide-upload-counter"
            />
            <p
              id="study-guide-upload-counter"
              className={`mt-1 text-xs ${overLimit ? "text-red-600 font-medium" : "text-gray-500"}`}
            >
              {byteCount.toLocaleString()} / {maxBytes.toLocaleString()} bytes
              {overLimit ? " — too long" : ""}
            </p>
          </div>

          <ItemTopicScopeFields
            idPrefix="study-guide-upload-scope"
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
            disabled={createMutation.isPending}
          />

          <div>
            <label htmlFor="study-guide-upload-keywords" className="block text-sm font-medium text-gray-700 mb-1">
              Keywords (comma-separated, optional)
            </label>
            <input
              id="study-guide-upload-keywords"
              type="text"
              value={keywordsText}
              onChange={(event) => setKeywordsText(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              placeholder="e.g. chapter-3, midterm"
            />
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending || overLimit}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? "Uploading…" : "Generate questions"}
          </button>
        </form>
      )}
    </div>
  );
};

export default StudyGuideUploadPage;
