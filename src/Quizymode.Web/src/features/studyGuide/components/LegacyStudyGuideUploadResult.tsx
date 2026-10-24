import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  studyGuideUploadsApi,
  type AcceptStudyGuideUploadResponse,
  type StudyGuideUploadResponse,
} from "@/api/studyGuideUploads";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { buildCategoryPath, categoryNameToSlug } from "@/utils/categorySlug";
import { readApiError } from "../studyGuideApiErrors";

const POLL_INTERVAL_MS = 2000;

interface LegacyStudyGuideUploadResultProps {
  uploadId: string;
  onStartOver: () => void;
}

/**
 * Result view for AC 6.5 one-shot uploads (`/create/notes?id=<uploadId>`). New uploads go
 * through study guide documents (AC 6.6); this keeps links to earlier uploads working.
 */
export function LegacyStudyGuideUploadResult({ uploadId, onStartOver }: LegacyStudyGuideUploadResultProps) {
  const queryClient = useQueryClient();
  const [deselected, setDeselected] = React.useState<Set<number>>(new Set());
  const [acceptSummary, setAcceptSummary] = React.useState<AcceptStudyGuideUploadResponse | null>(null);
  const [acceptError, setAcceptError] = React.useState<string | null>(null);

  const {
    data: upload,
    isLoading,
    error,
  } = useQuery<StudyGuideUploadResponse>({
    queryKey: ["studyGuideUploads", uploadId],
    queryFn: () => studyGuideUploadsApi.get(uploadId),
    refetchInterval: (query) => (query.state.data?.status === "Pending" ? POLL_INTERVAL_MS : false),
  });

  const acceptMutation = useMutation({
    mutationFn: (indexes: number[]) => studyGuideUploadsApi.accept(uploadId, indexes),
    onSuccess: (response) => {
      setAcceptSummary(response);
      setAcceptError(null);
      void queryClient.invalidateQueries({ queryKey: ["studyGuideUploads", uploadId] });
    },
    onError: (mutationError) => setAcceptError(readApiError(mutationError).message),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !upload) {
    return (
      <div className="space-y-3">
        <ErrorMessage message="This upload could not be found." />
        <button type="button" onClick={onStartOver} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
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
        <button
          type="button"
          onClick={onStartOver}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const selectedIndexes = upload.questions.map((_, index) => index).filter((index) => !deselected.has(index));
  const categoryPath = buildCategoryPath(categoryNameToSlug(upload.category), [
    upload.navigationKeyword1,
    upload.navigationKeyword2,
  ]);
  const accepted = !!upload.acceptedUtc || !!acceptSummary;

  const toggleQuestion = (index: number) => {
    setDeselected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {acceptError && <ErrorMessage message={acceptError} />}
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
              (acceptSummary.duplicateCount > 0
                ? ` (${acceptSummary.duplicateCount} duplicate${acceptSummary.duplicateCount === 1 ? "" : "s"} skipped)`
                : "") +
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
                {question.explanation && <p className="text-xs text-gray-500">{question.explanation}</p>}
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
            onClick={() => acceptMutation.mutate(selectedIndexes)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {acceptMutation.isPending ? "Adding…" : `Add ${selectedIndexes.length} selected to my items`}
          </button>
        )}
        <button
          type="button"
          onClick={onStartOver}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Upload another study guide
        </button>
      </div>
    </div>
  );
}
