import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { itemsApi, type UploadToCollectionResponse } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";
import ErrorMessage from "@/components/ErrorMessage";
import { DocumentArrowUpIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import ContentComplianceNotice from "@/features/legal/components/ContentComplianceNotice";

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

  const { data: taxonomyData, isLoading: isTaxonomyLoading } = useQuery({
    queryKey: ["taxonomy"],
    queryFn: () => taxonomyApi.getAll(),
    enabled: !!isAuthenticated,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const categoryOptions = React.useMemo(() => {
    const rows = (taxonomyData?.categories ?? []).map((c) => ({
      category: c.slug,
    }));
    return [...rows].sort((a, b) => a.category.localeCompare(b.category));
  }, [taxonomyData]);

  const selectedTaxonomyCategory = React.useMemo(
    () => taxonomyData?.categories.find((c) => c.slug === categoryName),
    [taxonomyData, categoryName]
  );

  const rank1Slugs = React.useMemo(
    () => selectedTaxonomyCategory?.groups.map((g) => g.slug) ?? [],
    [selectedTaxonomyCategory]
  );

  const rank2Slugs = React.useMemo(() => {
    const g = selectedTaxonomyCategory?.groups.find((x) => x.slug === rank1Name);
    return g?.keywords.map((k) => k.slug) ?? [];
  }, [selectedTaxonomyCategory, rank1Name]);

  const isLoadingRank1 = isTaxonomyLoading && !!categoryName.trim();
  const isLoadingRank2 = isTaxonomyLoading && !!rank1Name.trim();

  // Only sync from URL when we're still on the same category (avoid repopulating after user switches category)
  React.useEffect(() => {
    if (categoryParam && !categoryName) setCategoryName(categoryParam);
  }, [categoryParam, categoryName]);
  React.useEffect(() => {
    if (categoryParam && categoryName === categoryParam && keywordsFromUrl[0] && !rank1Name) {
      setRank1Name(keywordsFromUrl[0]);
    }
  }, [categoryParam, categoryName, keywordsFromUrl, rank1Name]);
  React.useEffect(() => {
    if (
      categoryParam &&
      categoryName === categoryParam &&
      rank1Name === keywordsFromUrl[0] &&
      keywordsFromUrl[1] &&
      !rank2Name
    ) {
      setRank2Name(keywordsFromUrl[1]);
    }
  }, [categoryParam, categoryName, rank1Name, keywordsFromUrl, rank2Name]);
  // Clear rank1/rank2 when they are invalid for the current category's options
  React.useEffect(() => {
    if (rank1Name && rank1Slugs.length > 0 && !rank1Slugs.includes(rank1Name)) {
      setRank1Name("");
      setRank2Name("");
    }
  }, [rank1Name, rank1Slugs]);
  React.useEffect(() => {
    if (rank2Name && rank2Slugs.length > 0 && !rank2Slugs.includes(rank2Name)) {
      setRank2Name("");
    }
  }, [rank2Name, rank2Slugs]);

  const topicName = [categoryName, rank1Name, rank2Name].filter(Boolean).join(" / ") || "your chosen topic";
  const examplePrompt = EXAMPLE_PROMPT(topicName, uploadId);

  const uploadMutation = useMutation({
    mutationFn: (payload: Parameters<typeof itemsApi.uploadToCollection>[0]) =>
      itemsApi.uploadToCollection(payload),
    onSuccess: (data: UploadToCollectionResponse) => {
      navigate(`/explore/collections/${data.collectionId}`);
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
      isPrivate: true,
      question: String(row.question ?? ""),
      correctAnswer: String(row.correctAnswer ?? ""),
      incorrectAnswers: Array.isArray(row.incorrectAnswers)
        ? row.incorrectAnswers.map(String)
        : [],
      explanation: String(row.explanation ?? ""),
      keywords: Array.isArray(row.keywords)
        ? row.keywords.map((k: string | { name?: string }) =>
            typeof k === "string"
              ? { name: k, isPrivate: true }
              : { name: String(k.name ?? ""), isPrivate: true }
          )
        : undefined,
      source: row.source != null ? String(row.source) : undefined,
    }));
    uploadMutation.mutate({
      category: categoryName.trim(),
      keyword1: rank1Name.trim(),
      keyword2: rank2Name.trim(),
      keywords: [],
      items: mapped,
      inputText: jsonText,
    });
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

      <ContentComplianceNotice />

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
                <option key={c.category} value={c.category}>
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
              {rank1Slugs.map((name) => (
                <option key={name} value={name}>
                  {name}
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
              {rank2Slugs.map((name) => (
                <option key={name} value={name}>
                  {name}
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
