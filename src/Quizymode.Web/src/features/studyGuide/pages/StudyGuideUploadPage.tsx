import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { studyGuideDocumentsApi, type CreateStudyGuideDocumentRequest } from "@/api/studyGuideDocuments";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { ItemTopicScopeFields } from "@/components/items/ItemTopicScopeFields";
import ContentComplianceNotice from "@/features/legal/components/ContentComplianceNotice";
import { parseKeywordsInput, utf8ByteLength } from "../studyGuideUploadSchema";
import {
  DEFAULT_DOCUMENT_LIMITS,
  STUDY_GUIDE_TITLE_MAX_LENGTH,
  formatBytes,
  validateStudyGuideDocumentForm,
  type StudyGuideDocumentLimits,
  type StudyGuideInputMode,
} from "../studyGuideDocumentSchema";
import { readApiError } from "../studyGuideApiErrors";
import { LegacyStudyGuideUploadResult } from "../components/LegacyStudyGuideUploadResult";

const UNAVAILABLE_MESSAGE = "AI study guide upload is unavailable right now. Please try again later.";

function getCreateErrorMessage(error: unknown, limits: StudyGuideDocumentLimits): string {
  const info = readApiError(error);
  if (info.status === 503) return UNAVAILABLE_MESSAGE;
  if (info.status === 413) return `File is too large. The limit is ${formatBytes(limits.maxFileBytes)}.`;
  if (info.status === 429) {
    return "You have uploaded several study guides recently. Please wait a while and try again.";
  }
  return info.message;
}

const TABS: Array<{ id: StudyGuideInputMode; label: string }> = [
  { id: "file", label: "Upload file" },
  { id: "text", label: "Paste text" },
];

const StudyGuideUploadPage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const legacyUploadId = searchParams.get("id")?.trim() ?? "";

  const [mode, setMode] = React.useState<StudyGuideInputMode>("file");
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [text, setText] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [categoryName, setCategoryName] = React.useState("");
  const [rank1Name, setRank1Name] = React.useState("");
  const [rank2Name, setRank2Name] = React.useState("");
  const [keywordsText, setKeywordsText] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [forcedUnavailable, setForcedUnavailable] = React.useState(false);
  const tabRefs = React.useRef<Record<StudyGuideInputMode, HTMLButtonElement | null>>({ file: null, text: null });

  const { data: config, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["studyGuideDocuments", "config"],
    queryFn: () => studyGuideDocumentsApi.getConfig(),
    enabled: isAuthenticated && !legacyUploadId,
  });
  const limits: StudyGuideDocumentLimits = {
    maxFileBytes: config?.maxFileBytes ?? DEFAULT_DOCUMENT_LIMITS.maxFileBytes,
    maxTextBytes: config?.maxTextBytes ?? DEFAULT_DOCUMENT_LIMITS.maxTextBytes,
    acceptedExtensions:
      config?.acceptedExtensions && config.acceptedExtensions.length > 0
        ? config.acceptedExtensions
        : DEFAULT_DOCUMENT_LIMITS.acceptedExtensions,
  };
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

  const createMutation = useMutation({
    mutationFn: (request: CreateStudyGuideDocumentRequest) => studyGuideDocumentsApi.create(request),
    onSuccess: (document) => {
      navigate(`/study-guides/documents/${encodeURIComponent(document.id)}`, {
        state: { isDuplicate: document.isDuplicate },
      });
    },
    onError: (error) => {
      if (readApiError(error).status === 503) {
        setForcedUnavailable(true);
      }
      setFormError(getCreateErrorMessage(error, limits));
    },
  });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const byteCount = utf8ByteLength(text);
  const textOverLimit = byteCount > limits.maxTextBytes;
  const fileOverLimit = !!file && file.size > limits.maxFileBytes;
  const submitBlocked = mode === "text" ? textOverLimit : fileOverLimit;

  const chooseFile = (candidate: File | null) => {
    setFile(candidate);
    setFormError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const form = {
      mode,
      file: mode === "file" ? file : null,
      text: mode === "text" ? text : "",
      title,
      category: categoryName,
      navigationKeyword1: rank1Name,
      navigationKeyword2: rank2Name,
      keywords: parseKeywordsInput(keywordsText),
    };
    const validationError = validateStudyGuideDocumentForm(form, limits);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    createMutation.mutate({
      file: form.file,
      text: form.mode === "text" ? form.text : null,
      title: title.trim() || null,
      category: form.category,
      navigationKeyword1: form.navigationKeyword1,
      navigationKeyword2: form.navigationKeyword2,
      keywords: form.keywords,
    });
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: StudyGuideInputMode = mode === "file" ? "text" : "file";
    setMode(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="px-4 py-6 sm:px-0 max-w-3xl mx-auto">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Generate Quiz from Study Guide</h1>
        <Link to="/study-guides/documents" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          My study guides
        </Link>
      </div>
      <p className="text-gray-600 text-sm mb-4">
        Upload a PDF, Word, PowerPoint, or text file (or paste notes). You pick which pages to turn into
        multiple-choice questions, and you review every question before anything is saved.
      </p>

      <ContentComplianceNotice />

      {formError && (
        <div className="mb-4">
          <ErrorMessage message={formError} onRetry={() => setFormError(null)} />
        </div>
      )}

      {legacyUploadId ? (
        <LegacyStudyGuideUploadResult uploadId={legacyUploadId} onStartOver={() => setSearchParams({})} />
      ) : isLoadingConfig ? (
        <LoadingSpinner />
      ) : !isEnabled ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-2" role="status">
          <h2 className="text-sm font-semibold text-gray-900">Feature unavailable</h2>
          <p className="text-sm text-gray-600">{UNAVAILABLE_MESSAGE}</p>
          <p className="text-sm text-gray-600">
            You can still{" "}
            <Link to="/study-guide" className="font-medium text-indigo-600 hover:text-indigo-800">
              build sets from a study guide manually
            </Link>{" "}
            or open{" "}
            <Link to="/study-guides/documents" className="font-medium text-indigo-600 hover:text-indigo-800">
              your earlier study guides
            </Link>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 bg-white p-4 rounded-lg shadow" noValidate>
          <div>
            <div role="tablist" aria-label="Study guide source" className="flex gap-1 border-b border-gray-200">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  ref={(element) => {
                    tabRefs.current[tab.id] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`study-guide-tab-${tab.id}`}
                  aria-selected={mode === tab.id}
                  aria-controls={`study-guide-panel-${tab.id}`}
                  tabIndex={mode === tab.id ? 0 : -1}
                  onClick={() => {
                    setMode(tab.id);
                    setFormError(null);
                  }}
                  onKeyDown={handleTabKeyDown}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                    mode === tab.id
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {mode === "file" ? (
              <div role="tabpanel" id="study-guide-panel-file" aria-labelledby="study-guide-tab-file" className="pt-4">
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    chooseFile(event.dataTransfer.files?.[0] ?? null);
                  }}
                  className={`rounded-lg border-2 border-dashed p-6 text-center ${
                    isDragging ? "border-indigo-500 bg-indigo-50" : "border-gray-300 bg-gray-50"
                  }`}
                  data-testid="study-guide-drop-zone"
                >
                  <p className="text-sm text-gray-700">Drag a file here, or</p>
                  <label
                    htmlFor="study-guide-file"
                    className="mt-2 inline-block cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500"
                  >
                    Choose study guide file
                    <input
                      id="study-guide-file"
                      type="file"
                      accept={limits.acceptedExtensions.join(",")}
                      className="sr-only"
                      aria-describedby="study-guide-file-hint"
                      onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <p id="study-guide-file-hint" className="mt-2 text-xs text-gray-500">
                    {limits.acceptedExtensions.join(", ")} · up to {formatBytes(limits.maxFileBytes)}
                    {config?.maxPages ? ` · up to ${config.maxPages} pages` : ""}. Scanned PDFs without selectable
                    text are not supported yet.
                  </p>
                  {file && (
                    <p
                      className={`mt-3 text-sm ${fileOverLimit ? "font-medium text-red-600" : "text-gray-800"}`}
                      data-testid="study-guide-selected-file"
                    >
                      Selected: {file.name} ({formatBytes(file.size)}){fileOverLimit ? " — too large" : ""}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div role="tabpanel" id="study-guide-panel-text" aria-labelledby="study-guide-tab-text" className="pt-4">
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
                  className={`mt-1 text-xs ${textOverLimit ? "text-red-600 font-medium" : "text-gray-500"}`}
                >
                  {byteCount.toLocaleString()} / {limits.maxTextBytes.toLocaleString()} bytes
                  {textOverLimit ? " — too long" : ""}
                </p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="study-guide-upload-title" className="block text-sm font-medium text-gray-700 mb-1">
              Title (optional)
            </label>
            <input
              id="study-guide-upload-title"
              type="text"
              value={title}
              maxLength={STUDY_GUIDE_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              placeholder="Defaults to the file name or the first line"
            />
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
            disabled={createMutation.isPending || submitBlocked}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? "Uploading…" : "Upload study guide"}
          </button>
        </form>
      )}
    </div>
  );
};

export default StudyGuideUploadPage;
