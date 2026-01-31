import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { itemsApi, type UploadToCollectionResponse } from "@/api/items";
import type { CreateItemRequest } from "@/types/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { Link } from "react-router-dom";
import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";

const UploadToCollectionPage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [jsonText, setJsonText] = React.useState("");
  const [parseError, setParseError] = React.useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (items: CreateItemRequest[]) =>
      itemsApi.uploadToCollection({ items }),
    onSuccess: (data: UploadToCollectionResponse) => {
      navigate(`/explore/collection/${data.collectionId}`);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setJsonText(text);
      setParseError(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setParseError(null);
    let items: unknown;
    try {
      items = JSON.parse(jsonText);
    } catch {
      setParseError("Invalid JSON. Paste a JSON array of items.");
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      setParseError("JSON must be a non-empty array of items.");
      return;
    }
    const mapped = items.map((row: Record<string, unknown>) => ({
      category: String(row.category ?? ""),
      isPrivate: true,
      question: String(row.question ?? ""),
      correctAnswer: String(row.correctAnswer ?? ""),
      incorrectAnswers: Array.isArray(row.incorrectAnswers)
        ? row.incorrectAnswers.map(String)
        : [],
      explanation: String(row.explanation ?? ""),
      keywords: Array.isArray(row.keywords)
        ? row.keywords.map((k: string | { name?: string }) =>
            typeof k === "string" ? { name: k, isPrivate: false } : { name: String(k.name ?? ""), isPrivate: false }
          )
        : undefined,
      source: row.source != null ? String(row.source) : undefined,
    })) as CreateItemRequest[];
    uploadMutation.mutate(mapped);
  };

  if (!isAuthenticated) {
    return (
      <div className="px-4 py-6 sm:px-0 max-w-2xl mx-auto">
        <p className="text-gray-600 mb-4">Sign in to upload items to a new collection.</p>
        <Link to="/login" className="text-indigo-600 hover:text-indigo-800">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload items to collection</h1>
      <p className="text-gray-600 text-sm mb-6">
        Paste a JSON array of items or upload a JSON file. Items are added to a new collection with a unique name (GUID). You can rename the collection and manage items after. Non-admin users can upload private items only. The collection URL can be shared with anyone.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="json" className="block text-sm font-medium text-gray-700 mb-1">
            JSON array of items
          </label>
          <textarea
            id="json"
            rows={14}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setParseError(null);
            }}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono text-sm"
            placeholder={[
              '[',
              '  { "category": "general", "question": "...", "correctAnswer": "...", "incorrectAnswers": ["...", "..."], "explanation": "...", "keywords": ["..."] },',
              '  ...',
              ']',
            ].join('\n')}
          />
        </div>

        <div className="flex items-center gap-4">
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
          >
            <DocumentArrowUpIcon className="h-5 w-5" />
            Choose JSON file
          </label>
          <button
            type="submit"
            disabled={uploadMutation.isPending || !jsonText.trim()}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadMutation.isPending ? "Uploading…" : "Upload and open collection"}
          </button>
        </div>
      </form>

      {(parseError || uploadMutation.error) && (
        <div className="mt-4">
          <ErrorMessage
            message={parseError ?? (uploadMutation.error as Error)?.message ?? "Upload failed"}
            onRetry={uploadMutation.error ? () => uploadMutation.reset() : undefined}
          />
        </div>
      )}
    </div>
  );
};

export default UploadToCollectionPage;
