import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { studyGuidesApi } from "@/api/studyGuides";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

function getUtf8ByteCount(text: string): number {
  return new TextEncoder().encode(text).length;
}

const PREPARATION_INSTRUCTIONS = `Preparation tips for best results:
• Paste plain text only (no images or complex formatting).
• Remove irrelevant boilerplate when possible.
• Keep one study topic per guide when possible.
• Separate unrelated sections with several blank lines or a visible separator (e.g. --- or ==== or ### Section Name).
• Use headings if possible; chunking works better with clear structure.
• Avoid mixing unrelated subjects in one upload.`;

const StudyGuidePage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [contentText, setContentText] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const { data: effectiveMaxBytes = studyGuidesApi.defaultMaxBytesPerUser } = useQuery({
    queryKey: ["studyGuide", "maxBytes"],
    queryFn: () => studyGuidesApi.getEffectiveMaxBytes(),
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: false,
  });

  const { data: guide, isLoading } = useQuery({
    queryKey: ["studyGuide", "current"],
    queryFn: () => studyGuidesApi.getCurrent(),
    enabled: isAuthenticated,
  });

  React.useEffect(() => {
    if (guide) {
      setTitle(guide.title);
      setContentText(guide.contentText);
    } else if (!isLoading && !guide) {
      setTitle("");
      setContentText("");
    }
  }, [guide, isLoading]);

  const upsertMutation = useMutation({
    mutationFn: (payload: { title: string; contentText: string }) =>
      studyGuidesApi.upsert(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studyGuide", "current"] });
      setSaveError(null);
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string; description?: string } } })
              .response?.data?.detail ||
            (err as { response?: { data?: { description?: string } } }).response?.data
              ?.description ||
            "Failed to save study guide."
          : "Failed to save study guide.";
      setSaveError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => studyGuidesApi.delete(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studyGuide", "current"] });
      setTitle("");
      setContentText("");
      setSaveError(null);
    },
    onError: () => {
      setSaveError("Failed to delete study guide.");
    },
  });

  const currentBytes = getUtf8ByteCount(contentText);
  const remainingBytes = Math.max(0, effectiveMaxBytes - currentBytes);
  const isOverLimit = currentBytes > effectiveMaxBytes;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSaveError("Title is required.");
      return;
    }
    if (isOverLimit) {
      setSaveError(
        `Content exceeds the ${effectiveMaxBytes.toLocaleString()} byte limit (current: ${currentBytes.toLocaleString()} bytes).`
      );
      return;
    }
    upsertMutation.mutate({ title: trimmedTitle, contentText });
  };

  const handleDelete = () => {
    if (!window.confirm("Delete your study guide? This cannot be undone.")) return;
    deleteMutation.mutate();
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
      <div className="rounded-xl bg-white/95 text-gray-900 shadow-sm border border-slate-200/80 p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Study Guide</h1>
      <p className="text-gray-600 text-sm mb-4">
        Store your study guide text here (max {(effectiveMaxBytes / 1024).toFixed(1)} KB total). You can then use it to
        generate prompts and import items.
      </p>
      {location.search && (
        <p className="text-xs text-indigo-700 mb-4">
          Your selected category, topic path, and extra keywords will be kept when you continue to AI prompt sets.
        </p>
      )}

      <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
        <h2 className="font-medium mb-2">Preparation instructions</h2>
        <pre className="whitespace-pre-wrap font-sans">{PREPARATION_INSTRUCTIONS}</pre>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="sg-title" className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            id="sg-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            maxLength={200}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 placeholder:text-gray-500"
            placeholder="e.g. AWS SAA Study Notes"
          />
        </div>

        <div>
          <label htmlFor="sg-content" className="block text-sm font-medium text-gray-700 mb-1">
            Study guide text
          </label>
          <textarea
            id="sg-content"
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            rows={16}
            className={`w-full px-3 py-2 border rounded-md text-sm font-mono bg-white text-gray-900 placeholder:text-gray-500 ${
              isOverLimit ? "border-red-500 bg-red-50" : "border-gray-300"
            }`}
            placeholder="Paste your study guide text here..."
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>
              {currentBytes.toLocaleString()} bytes
              {isOverLimit && (
                <span className="text-red-600 ml-1">
                  (over {(effectiveMaxBytes / 1024).toFixed(1)} KB limit)
                </span>
              )}
            </span>
            <span>Remaining: {remainingBytes.toLocaleString()} bytes</span>
          </div>
        </div>

        {saveError && (
          <ErrorMessage message={saveError} onRetry={() => setSaveError(null)} />
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={upsertMutation.isPending || isOverLimit}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {upsertMutation.isPending ? "Saving..." : "Save"}
          </button>
          {guide && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          )}
          {guide && (
            <button
              type="button"
              onClick={() => navigate(`/study-guide/import${location.search}`)}
              className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
            >
              Continue to prompt sets
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/categories")}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
      </div>
    </div>
  );
};

export default StudyGuidePage;
