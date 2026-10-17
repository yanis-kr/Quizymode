import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { studyGuideDocumentsApi } from "@/api/studyGuideDocuments";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { buildCollectionStudyPath } from "@/utils/collectionPath";
import { formatDate } from "../studyGuideSections";

const StudyGuideDocumentsPage = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["studyGuideDocuments", "list"],
    queryFn: () => studyGuideDocumentsApi.list(),
  });

  const documents = data?.documents ?? [];

  return (
    <div className="px-4 py-6 sm:px-0 max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">My study guides</h1>
        <Link
          to="/study-guide/upload"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Upload a study guide
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        Study guides you uploaded for quiz generation. The extracted text is kept for 30 days after you last use a
        guide; saved questions stay in your collections.
      </p>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message="Failed to load your study guides." onRetry={() => void refetch()} />
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
          You have not uploaded any study guides yet.{" "}
          <Link to="/study-guide/upload" className="font-medium text-indigo-600 hover:text-indigo-800">
            Upload one
          </Link>{" "}
          to generate quiz questions.
        </div>
      ) : (
        <ul className="space-y-3">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{document.title}</p>
                <p className="text-xs text-gray-600">
                  {document.generatedSectionCount} of {document.sectionCount} section
                  {document.sectionCount === 1 ? "" : "s"} generated · {document.acceptedCount} question
                  {document.acceptedCount === 1 ? "" : "s"} saved
                </p>
                <p className="text-xs text-gray-500">
                  Last activity {formatDate(document.lastActivityUtc)} · Text kept until {formatDate(document.expiresUtc)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {document.collectionId && (
                  <Link
                    to={buildCollectionStudyPath("explore", document.collectionId)}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Collection
                  </Link>
                )}
                <Link
                  to={`/study-guides/documents/${encodeURIComponent(document.id)}`}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  aria-label={`Continue ${document.title}`}
                >
                  Continue
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StudyGuideDocumentsPage;
