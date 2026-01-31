import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { itemsApi, type UploadToCollectionResponse } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import type { CreateItemRequest } from "@/types/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { DocumentArrowUpIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";

const EXAMPLE_PROMPT = (topic: string, uploadId: string) => `You are creating study flashcards for an app called Quizymode.

Create up to 30 quiz items about ${topic}. Attach Study Guide (optional).

Each item must be a JSON object with this exact shape:

{
  "category": "Category Name",
  "question": "Question text?",
  "correctAnswer": "Correct answer",
  "incorrectAnswers": ["Wrong answer 1", "Wrong answer 2", "Wrong answer 3"],
  "explanation": "Short explanation of why the correct answer is right (optional but recommended)",
  "source": "ChatGPT",
  "uploadId" : "${uploadId}"
}

Requirements:
- Return a single JSON array of items: [ { ... }, { ... }, ... ].
- Do NOT include any explanations, prose, comments, Markdown, or code fences. Output raw JSON only.
- Every item must have:
  - "category" (max 50 characters)
  - a non-empty "question" (max 1,000 characters)
  - a non-empty "correctAnswer" (max 200 characters)
  - 1–5 "incorrectAnswers" (each max 200 characters)
  - "source" (optional, max 200 characters - e.g., "ChatGPT", "Claude", "Manual")
- All strings must be plain text (no HTML, no LaTeX).

Now generate the JSON array only.`;

const UploadToCollectionPage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get("category") ?? "";
  const keywordsParam = searchParams.get("keywords");
  const keywordsFromUrl = keywordsParam ? keywordsParam.split(",").map((k) => k.trim()).filter(Boolean) : [];

  const [categoryName, setCategoryName] = React.useState(categoryParam);
  const [rank1Name, setRank1Name] = React.useState(keywordsFromUrl[0] ?? "");
  const [rank2Name, setRank2Name] = React.useState(keywordsFromUrl[1] ?? "");
  const [jsonText, setJsonText] = React.useState("");
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [uploadId] = React.useState(() => crypto.randomUUID());
  const [copiedPrompt, setCopiedPrompt] = React.useState(false);

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!isAuthenticated,
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
  // Only show rank1 options when loaded for current category (avoid showing previous category's keywords)
  const rank1Keywords = isLoadingRank1
    ? []
    : (rank1Data?.keywords ?? []).filter((k) => k.name.toLowerCase() !== "other");

  const {
    data: rank2Data,
    isLoading: isLoadingRank2,
  } = useQuery({
    queryKey: ["keywords", "rank2", categoryName, rank1Name],
    queryFn: () => keywordsApi.getNavigationKeywords(categoryName, rank1Name ? [rank1Name] : []),
    enabled: !!isAuthenticated && !!categoryName.trim() && !!rank1Name.trim(),
  });
  const rank2Keywords = isLoadingRank2 ? [] : (rank2Data?.keywords ?? []);

  React.useEffect(() => {
    if (categoryParam && !categoryName) setCategoryName(categoryParam);
  }, [categoryParam, categoryName]);
  React.useEffect(() => {
    if (keywordsFromUrl[0] && !rank1Name) setRank1Name(keywordsFromUrl[0]);
  }, [keywordsFromUrl, rank1Name]);
  React.useEffect(() => {
    if (keywordsFromUrl[1] && !rank2Name) setRank2Name(keywordsFromUrl[1]);
  }, [keywordsFromUrl, rank2Name]);
  React.useEffect(() => {
    if (rank1Name && rank1Keywords.length > 0 && !rank1Keywords.some((k) => k.name === rank1Name)) {
      setRank1Name("");
      setRank2Name("");
    }
  }, [rank1Name, rank1Keywords]);
  React.useEffect(() => {
    if (rank2Name && rank2Keywords.length > 0 && !rank2Keywords.some((k) => k.name === rank2Name)) {
      setRank2Name("");
    }
  }, [rank2Name, rank2Keywords]);

  const topicName = [categoryName, rank1Name, rank2Name].filter(Boolean).join(" / ") || "your chosen topic";
  const examplePrompt = EXAMPLE_PROMPT(topicName, uploadId);

  const uploadMutation = useMutation({
    mutationFn: ({ items, inputText }: { items: CreateItemRequest[]; inputText: string }) =>
      itemsApi.uploadToCollection({ items, inputText }),
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
    if (!categoryName.trim()) {
      setParseError("Please select a category.");
      return;
    }
    if (!rank1Name.trim()) {
      setParseError("Please select a rank-1 keyword.");
      return;
    }
    if (!rank2Name.trim()) {
      setParseError("Please select a rank-2 keyword.");
      return;
    }
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
      category: String(row.category ?? categoryName),
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
    uploadMutation.mutate({ items: mapped, inputText: jsonText });
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(examplePrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
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
    <div className="px-4 py-6 sm:px-0 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload items to collection</h1>
      <p className="text-gray-600 text-sm mb-6">
        Select category and keywords (required), then paste a JSON array of items or upload a JSON file. Items are added to a new collection. Duplicate uploads (same content) are rejected.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Category (required)
            </label>
            <select
              id="category"
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                setRank1Name("");
                setRank2Name("");
              }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
            >
              <option value="">— Select —</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.category}>
                  {c.category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rank1" className="block text-sm font-medium text-gray-700 mb-1">
              Keyword rank 1 (required)
            </label>
            <select
              id="rank1"
              value={rank1Name}
              onChange={(e) => {
                setRank1Name(e.target.value);
                setRank2Name("");
              }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
              disabled={!categoryName || isLoadingRank1}
            >
              <option value="">{isLoadingRank1 ? "Loading…" : "— Select —"}</option>
              {rank1Keywords.map((k) => (
                <option key={k.name} value={k.name}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rank2" className="block text-sm font-medium text-gray-700 mb-1">
              Keyword rank 2 (required)
            </label>
            <select
              id="rank2"
              value={rank2Name}
              onChange={(e) => setRank2Name(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
              disabled={!rank1Name || isLoadingRank2}
            >
              <option value="">{isLoadingRank2 ? "Loading…" : "— Select —"}</option>
              {rank2Keywords.map((k) => (
                <option key={k.name} value={k.name}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Example prompt for AI</label>
          <p className="text-xs text-gray-500 mb-1">
            Copy this prompt and use it with ChatGPT/Claude to generate the JSON. Then paste the result below.
          </p>
          <div className="relative">
            <pre className="block w-full rounded-md border border-gray-300 bg-gray-50 p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
              {examplePrompt}
            </pre>
            <button
              type="button"
              onClick={copyPrompt}
              className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              {copiedPrompt ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

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
              '  { "category": "Category Name", "question": "...", "correctAnswer": "...", "incorrectAnswers": ["...", "..."], "explanation": "...", "source": "ChatGPT", "uploadId": "' + uploadId + '" },',
              '  ...',
              ']',
            ].join("\n")}
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
