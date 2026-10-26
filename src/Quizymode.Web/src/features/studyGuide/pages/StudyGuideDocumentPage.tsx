import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  studyGuideDocumentsApi,
  type AcceptStudyGuideCandidate,
  type AcceptStudyGuideCandidatesResponse,
  type GenerateStudyGuideSectionsResponse,
  type StudyGuideDocument,
} from "@/api/studyGuideDocuments";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { buildCollectionPath, buildCollectionStudyPath } from "@/utils/collectionPath";
import type { CandidateEdit } from "../studyGuideDocumentSchema";
import { readApiError } from "../studyGuideApiErrors";
import {
  MAX_CANDIDATES_PER_ACCEPT,
  STUDY_GUIDE_POLL_INTERVAL_MS,
  chunk,
  computePreselection,
  countGeneratedSections,
  formatDate,
  getFreeTierWaitMinutes,
  hasActiveGeneration,
  pruneSelection,
} from "../studyGuideSections";
import { StudyGuideSectionPicker } from "../components/StudyGuideSectionPicker";
import { StudyGuideCandidateCard } from "../components/StudyGuideCandidateCard";
import { StudyGuideSteps } from "../components/StudyGuideSteps";

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  txt: "Text",
};

function getGenerateErrorMessage(error: unknown): string {
  const info = readApiError(error);
  if (info.status === 429) {
    return info.message !== "Something went wrong."
      ? info.message
      : "You have reached your section limit. Try again tomorrow or select fewer sections.";
  }
  if (info.status === 503) {
    if (info.code === "StudyGuideDocument.BudgetReached") {
      return "Question generation is paused for the rest of this month. Please try again next month.";
    }
    return "AI question generation is unavailable right now. Please try again later.";
  }
  return info.message;
}

interface AcceptSummary {
  collectionId: string;
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
}

const StudyGuideDocumentPage = () => {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isDuplicate = !!(location.state as { isDuplicate?: boolean } | null)?.isDuplicate;

  const [selection, setSelection] = React.useState<Set<string> | null>(null);
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const [edits, setEdits] = React.useState<Record<string, CandidateEdit>>({});
  const [generateError, setGenerateError] = React.useState<string | null>(null);
  const [generateResult, setGenerateResult] = React.useState<GenerateStudyGuideSectionsResponse | null>(null);
  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [acceptSummary, setAcceptSummary] = React.useState<AcceptSummary | null>(null);
  const [collectionNameInput, setCollectionNameInput] = React.useState<string | null>(null);
  const pickerRef = React.useRef<HTMLDivElement>(null);

  const queryKey = ["studyGuideDocuments", id];
  const {
    data: document,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery<StudyGuideDocument>({
    queryKey,
    queryFn: () => studyGuideDocumentsApi.get(id),
    enabled: !!id,
    refetchInterval: (query) => (hasActiveGeneration(query.state.data) ? STUDY_GUIDE_POLL_INTERVAL_MS : false),
  });

  const generateMutation = useMutation({
    mutationFn: (sectionIds: string[]) => studyGuideDocumentsApi.generate(id, sectionIds),
    onSuccess: (response) => {
      setGenerateResult(response);
      setGenerateError(null);
      setSelection(new Set());
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["studyGuideDocuments", "list"] });
    },
    onError: (mutationError) => {
      setGenerateResult(null);
      setGenerateError(getGenerateErrorMessage(mutationError));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async ({
      candidates,
      collectionName,
    }: {
      candidates: AcceptStudyGuideCandidate[];
      collectionName?: string;
    }) => {
      const responses: AcceptStudyGuideCandidatesResponse[] = [];
      for (const batch of chunk(candidates, MAX_CANDIDATES_PER_ACCEPT)) {
        // Only the first batch can create the collection; later batches reuse it.
        responses.push(
          await studyGuideDocumentsApi.accept(id, batch, responses.length === 0 ? collectionName : undefined)
        );
      }
      return responses;
    },
    onSuccess: (responses) => {
      const last = responses[responses.length - 1];
      setAcceptSummary({
        collectionId: last.collectionId,
        createdCount: responses.reduce((sum, response) => sum + response.createdCount, 0),
        duplicateCount: responses.reduce((sum, response) => sum + response.duplicateCount, 0),
        failedCount: responses.reduce((sum, response) => sum + response.failedCount, 0),
      });
      setAcceptError(null);
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["studyGuideDocuments", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (mutationError) => {
      setAcceptError(readApiError(mutationError).message);
      // An earlier batch may have created the collection, so refresh the document to hide the name input.
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !document) {
    const notFound = readApiError(error).status === 404;
    return (
      <div className="px-4 py-6 sm:px-0 max-w-3xl mx-auto space-y-3">
        <ErrorMessage
          message={notFound ? "This study guide could not be found. It may have expired." : "Failed to load this study guide."}
          onRetry={notFound ? undefined : () => void refetch()}
        />
        <Link to="/study-guides/documents" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Back to my study guides
        </Link>
      </div>
    );
  }

  const effectiveSelection = pruneSelection(document, selection ?? computePreselection(document));
  const sections = [...document.sections].sort((a, b) => a.index - b.index);
  const generatedSections = sections.filter((section) => section.status === "Generated");
  const generatedCount = countGeneratedSections(document);
  const active = hasActiveGeneration(document);
  const freeTierWait = getFreeTierWaitMinutes(document, dataUpdatedAt);
  const collectionId = acceptSummary?.collectionId ?? document.collectionId ?? null;

  const needsCollectionName = !collectionId;
  const collectionNameValue = (collectionNameInput ?? document.title).slice(0, 200);
  const currentStep = generatedCount > 0 ? "review" : "coverage";

  const focusPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    picker.scrollIntoView?.({ behavior: "smooth", block: "start" });
    picker.focus();
  };

  const toggleSection = (sectionId: string) => {
    const next = new Set(effectiveSelection);
    if (next.has(sectionId)) next.delete(sectionId);
    else next.add(sectionId);
    setSelection(next);
    setGenerateError(null);
  };

  const toggleCandidate = (candidateId: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const saveEdit = (candidateId: string, edit: CandidateEdit) => {
    setEdits((current) => ({ ...current, [candidateId]: edit }));
  };

  const pendingCandidates = generatedSections.flatMap((section) =>
    section.candidates.filter((candidate) => !candidate.accepted && !excluded.has(candidate.id))
  );
  const acceptPayload: AcceptStudyGuideCandidate[] = pendingCandidates.map((candidate) => {
    const edit = edits[candidate.id];
    return edit
      ? {
          id: candidate.id,
          question: edit.question,
          correctAnswer: edit.correctAnswer,
          incorrectAnswers: edit.incorrectAnswers,
          explanation: edit.explanation,
        }
      : { id: candidate.id };
  });

  const questionNumbers = new Map<string, number>();
  generatedSections
    .flatMap((section) => [...section.candidates].sort((a, b) => a.index - b.index))
    .forEach((candidate, index) => questionNumbers.set(candidate.id, index + 1));

  return (
    <div className="px-4 py-6 sm:px-0 max-w-3xl mx-auto space-y-5">
      <Link to="/study-guides/documents" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
        ← My study guides
      </Link>

      <StudyGuideSteps current={currentStep} />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 break-words">{document.title}</h1>
        <p className="text-sm text-gray-600">
          {FILE_TYPE_LABELS[document.fileType] ?? document.fileType}
          {document.pageCount != null ? ` · ${document.pageCount} page${document.pageCount === 1 ? "" : "s"}` : ""}
          {" · "}
          {generatedCount} of {sections.length} section{sections.length === 1 ? "" : "s"} generated
          {" · "}
          {document.category} / {document.navigationKeyword1} / {document.navigationKeyword2}
        </p>
        <p className="text-xs text-gray-500">
          Text kept until {formatDate(document.expiresUtc)}. Saved questions stay in your collection after that.
        </p>
        {collectionId && (
          <Link
            to={buildCollectionStudyPath("explore", collectionId)}
            className="inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Open collection
          </Link>
        )}
      </header>

      {isDuplicate && (
        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800" role="status">
          You already uploaded this study guide, so here is your existing copy.
        </div>
      )}

      {active && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          {freeTierWait != null
            ? `Free plan: generation starts within about ${freeTierWait} minute${freeTierWait === 1 ? "" : "s"}. You can leave this page and come back.`
            : "Generating questions… This page updates automatically."}
        </div>
      )}

      {generateResult && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">
          Queued {generateResult.queuedCount} section{generateResult.queuedCount === 1 ? "" : "s"}
          {generateResult.cachedCount > 0 ? ` (${generateResult.cachedCount} ready for free)` : ""}. Used{" "}
          {generateResult.chargedSections} of your sections.
        </div>
      )}

      {generateError && <ErrorMessage message={generateError} onRetry={() => setGenerateError(null)} />}

      <div ref={pickerRef} tabIndex={-1} className="focus:outline-none">
        <StudyGuideSectionPicker
          sections={sections}
          quota={document.quota}
          selection={effectiveSelection}
          onToggle={toggleSection}
          onGenerate={() => generateMutation.mutate([...effectiveSelection])}
          isGenerating={generateMutation.isPending}
        />
      </div>

      {generatedSections.length > 0 && (
        <section aria-labelledby="study-guide-review-heading" className="space-y-4">
          <div>
            <h2 id="study-guide-review-heading" className="text-lg font-semibold text-gray-900">
              Review questions
            </h2>
            <p className="text-sm text-gray-600">
              Every question quotes the part of your guide it came from. Uncheck or edit questions, then save them to
              your collection.
            </p>
          </div>

          {acceptSummary && (
            <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
              <p role="status">
                Saved {acceptSummary.createdCount} question{acceptSummary.createdCount === 1 ? "" : "s"} to your
                collection
                {acceptSummary.duplicateCount > 0 ? ` (${acceptSummary.duplicateCount} already saved)` : ""}
                {acceptSummary.failedCount > 0 ? ` · ${acceptSummary.failedCount} could not be saved` : ""}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={buildCollectionStudyPath("quiz", acceptSummary.collectionId)}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
                >
                  Start quiz
                </Link>
                <Link
                  to={buildCollectionStudyPath("explore", acceptSummary.collectionId)}
                  className="rounded-md border border-green-300 bg-white px-3 py-1.5 font-medium text-green-900 hover:bg-green-100"
                >
                  Study flashcards
                </Link>
                <button
                  type="button"
                  onClick={focusPicker}
                  className="rounded-md border border-green-300 bg-white px-3 py-1.5 font-medium text-green-900 hover:bg-green-100"
                >
                  Add more
                </button>
                <Link
                  to={buildCollectionPath(acceptSummary.collectionId)}
                  className="rounded-md border border-green-300 bg-white px-3 py-1.5 font-medium text-green-900 hover:bg-green-100"
                >
                  Open collection
                </Link>
              </div>
            </div>
          )}
          {acceptError && <ErrorMessage message={acceptError} onRetry={() => setAcceptError(null)} />}

          {generatedSections.map((section) => (
            <div key={section.id} className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">
                {section.label}
                {section.cached && <span className="ml-2 text-xs font-normal text-emerald-700">(ready, free)</span>}
              </h3>
              {section.droppedCount > 0 && (
                <p className="text-xs text-gray-500">
                  {section.droppedCount} question{section.droppedCount === 1 ? "" : "s"} dropped: not found in your
                  guide.
                </p>
              )}
              {section.candidates.length === 0 ? (
                <p className="text-sm text-gray-600">No questions could be made from this section.</p>
              ) : (
                <ol className="space-y-3">
                  {[...section.candidates]
                    .sort((a, b) => a.index - b.index)
                    .map((candidate) => (
                      <StudyGuideCandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        number={questionNumbers.get(candidate.id) ?? 0}
                        sectionLabel={section.label}
                        included={!excluded.has(candidate.id)}
                        edit={edits[candidate.id]}
                        onToggle={toggleCandidate}
                        onSaveEdit={saveEdit}
                        disabled={acceptMutation.isPending}
                      />
                    ))}
                </ol>
              )}
            </div>
          ))}

          {needsCollectionName && (
            <div className="space-y-1">
              <label htmlFor="study-guide-collection-name" className="block text-sm font-medium text-gray-800">
                Collection name
              </label>
              <input
                id="study-guide-collection-name"
                type="text"
                maxLength={200}
                value={collectionNameValue}
                onChange={(event) => setCollectionNameInput(event.target.value)}
                disabled={acceptMutation.isPending}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500">
                Your saved questions go into a new private collection with this name.
              </p>
            </div>
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white/95 py-3">
            <button
              type="button"
              disabled={acceptPayload.length === 0 || acceptMutation.isPending}
              onClick={() =>
                acceptMutation.mutate({
                  candidates: acceptPayload,
                  collectionName: needsCollectionName ? collectionNameValue.trim() || undefined : undefined,
                })
              }
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {acceptMutation.isPending ? "Saving…" : `Save ${acceptPayload.length} selected`}
            </button>
            <span className="text-xs text-gray-500">Questions are saved as your private items.</span>
          </div>
        </section>
      )}
    </div>
  );
};

export default StudyGuideDocumentPage;
