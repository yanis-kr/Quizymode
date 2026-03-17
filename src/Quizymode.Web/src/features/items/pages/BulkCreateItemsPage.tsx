/**
 * Bulk Create Items (AI-assisted): select category/keywords/collection → generate prompt →
 * copy to AI → paste response → review in memory → accept/reject → save via API.
 */
import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import ErrorMessage from "@/components/ErrorMessage";
import { apiClient } from "@/api/client";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { collectionsApi } from "@/api/collections";
import {
  XMarkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

const MAX_PROMPT_QUESTIONS = 15;
const KEYWORD_FORMAT = /^[a-zA-Z0-9\-]+$/;
const KEYWORD_MAX_LEN = 30;

type Step = "setup" | "prompt" | "paste" | "review";

interface ParsedItem {
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  source?: string;
  keywords?: string[];
}

const BulkCreateItemsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCategory = searchParams.get("category") ?? "";
  const urlKeywords = searchParams.get("keywords")?.split(",").filter(Boolean) ?? [];

  const [step, setStep] = useState<Step>("setup");
  const [category, setCategory] = useState("");
  const [primaryTopic, setPrimaryTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [extraKeywordsText, setExtraKeywordsText] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [pastedResponse, setPastedResponse] = useState("");
  const [pendingItems, setPendingItems] = useState<ParsedItem[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<{
    isOpen: boolean;
    message: string;
    details: string;
  }>({ isOpen: false, message: "", details: "" });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: isAuthenticated,
  });
  const categories = categoriesData?.categories ?? [];
  const categoryOptions = useMemo(
    () => [...categories].sort((a, b) => a.category.localeCompare(b.category)),
    [categories]
  );

  useEffect(() => {
    if (categoryOptions.length === 0) return;
    if (urlCategory && !category && categoryOptions.some((c) => c.category === urlCategory)) {
      setCategory(urlCategory);
    }
    if (urlKeywords.length > 0 && !primaryTopic) {
      setPrimaryTopic(urlKeywords[0] ?? "");
      if (urlKeywords.length > 1) setSubtopic(urlKeywords[1] ?? "");
    }
  }, [urlCategory, urlKeywords, categoryOptions.length]);

  const { data: rank1Data } = useQuery({
    queryKey: ["keywords", "rank1", category],
    queryFn: () => keywordsApi.getNavigationKeywords(category, []),
    enabled: isAuthenticated && !!category.trim(),
  });
  const rank1Keywords = (rank1Data?.keywords ?? []).filter(
    (k) => k.name.toLowerCase() !== "other"
  );

  const { data: rank2Data } = useQuery({
    queryKey: ["keywords", "rank2", category, primaryTopic],
    queryFn: () =>
      keywordsApi.getNavigationKeywords(category, primaryTopic ? [primaryTopic] : []),
    enabled: isAuthenticated && !!category.trim() && !!primaryTopic.trim(),
  });
  const rank2Keywords = rank2Data?.keywords ?? [];

  const { data: collectionsData } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated,
  });
  const collections = collectionsData?.collections ?? [];

  const navKeywords = useMemo(() => {
    const list: string[] = [];
    if (primaryTopic.trim()) list.push(primaryTopic.trim());
    if (subtopic.trim()) list.push(subtopic.trim());
    return list;
  }, [primaryTopic, subtopic]);

  const extraKeywords = useMemo(
    () =>
      extraKeywordsText
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [extraKeywordsText]
  );

  const validateKeywordFormat = (name: string): string | null => {
    const t = name.trim();
    if (!t) return null;
    if (t.length > KEYWORD_MAX_LEN) return `Max ${KEYWORD_MAX_LEN} characters`;
    if (!KEYWORD_FORMAT.test(t)) return "Use only letters, numbers, and hyphens";
    return null;
  };

  const handleGeneratePrompt = () => {
    setLocalError(null);
    if (!category.trim()) {
      setLocalError("Select a category.");
      return;
    }
    if (!primaryTopic.trim()) {
      setLocalError("Select or enter a primary topic (rank 1).");
      return;
    }
    const navLine =
      [primaryTopic, subtopic].filter(Boolean).join(" → ") || primaryTopic;
    const extraLine =
      extraKeywords.length > 0 ? ` Tags to include on each item: ${extraKeywords.join(", ")}.` : "";
    const prompt = `You are creating study flashcards for an app called Quizymode.

Create up to ${MAX_PROMPT_QUESTIONS} quiz items for:
- Category: ${category}
- Topic: ${navLine}
${extraLine}

Each item must be a JSON object with this exact shape:
{
  "category": "${category}",
  "question": "Question text?",
  "correctAnswer": "Correct answer",
  "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
  "explanation": "Short explanation (optional but recommended)",
  "source": "Your assistant name"
}

Requirements:
- Return a single JSON array of items: [ { ... }, { ... }, ... ].
- Do NOT include any explanations, prose, comments, Markdown, or code fences. Output raw JSON only.
- Every item must have: "category", non-empty "question", non-empty "correctAnswer", 1–5 "incorrectAnswers", optional "explanation" and "source".
- All strings must be plain text (no HTML, no LaTeX).

Generate the JSON array only.`;

    setGeneratedPrompt(prompt);
    setStep("prompt");
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleParseAndReview = () => {
    setLocalError(null);
    if (!pastedResponse.trim()) {
      setLocalError("Paste the AI response first.");
      return;
    }
    try {
      const parsed = JSON.parse(pastedResponse);
      if (!Array.isArray(parsed)) {
        setLocalError("Response must be a JSON array of items.");
        return;
      }
      const selectedCategory = category.trim();
      const items: ParsedItem[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const o = parsed[i] as Record<string, unknown>;
        const itemCategory = (o.category ?? "").toString().trim();
        if (selectedCategory && itemCategory.toLowerCase() !== selectedCategory.toLowerCase()) {
          continue;
        }
        const question = (o.question ?? "").toString().trim();
        const correctAnswer = (o.correctAnswer ?? "").toString().trim();
        if (!question || !correctAnswer) continue;
        let incorrectAnswers: string[] = [];
        if (Array.isArray(o.incorrectAnswers)) {
          incorrectAnswers = o.incorrectAnswers.map((a) => String(a).trim()).filter(Boolean);
        }
        const explanation = (o.explanation ?? "").toString().trim();
        const source = (o.source ?? "").toString().trim() || undefined;
        let keywords: string[] = [];
        if (Array.isArray(o.keywords)) {
          keywords = (o.keywords as (string | { name?: string })[]).map((k) => (typeof k === "string" ? k : (k as { name?: string }).name ?? "").trim()).filter(Boolean);
        }
        items.push({
          question,
          correctAnswer,
          incorrectAnswers: incorrectAnswers.slice(0, 5),
          explanation,
          source,
          keywords: keywords.length > 0 ? keywords : undefined,
        });
      }
      if (items.length === 0) {
        setLocalError("No valid items found in the response, or category did not match.");
        return;
      }
      setPendingItems(items);
      setStep("review");
    } catch (e) {
      setLocalError(
        `Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}`
      );
    }
  };

  const bulkCreateMutation = useMutation({
    mutationFn: async (itemsToSave: ParsedItem[]) => {
      const isPrivate = !isAdmin;
      const keywordRequests: { name: string; isPrivate: boolean }[] = [];
      navKeywords.forEach((name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (!keywordRequests.some((k) => k.name.toLowerCase() === trimmed.toLowerCase())) {
          keywordRequests.push({ name: trimmed, isPrivate });
        }
      });
      extraKeywords.forEach((name) => {
        const trimmed = name.trim();
        if (
          trimmed &&
          !keywordRequests.some((k) => k.name.toLowerCase() === trimmed.toLowerCase())
        ) {
          keywordRequests.push({ name: trimmed, isPrivate });
        }
      });
      const payload = {
        isPrivate,
        category: category,
        keyword1: primaryTopic.trim(),
        keyword2: subtopic.trim() || null,
        keywords: keywordRequests,
        items: itemsToSave.map((item) => {
          const itemKeywords = [...keywordRequests];
          (item.keywords ?? []).forEach((k) => {
            const n = k.trim().toLowerCase();
            if (n && !itemKeywords.some((x) => x.name.toLowerCase() === n)) {
              itemKeywords.push({ name: k.trim(), isPrivate });
            }
          });
          return {
            question: item.question,
            correctAnswer: item.correctAnswer,
            incorrectAnswers: item.incorrectAnswers,
            explanation: item.explanation || "",
            keywords: itemKeywords.length > 0 ? itemKeywords : undefined,
            source: item.source,
          };
        }),
      };
      const res = await apiClient.post<{
        totalRequested: number;
        createdCount: number;
        duplicateCount: number;
        failedCount: number;
        duplicateQuestions: string[];
        errors: Array<{ index: number; question: string; errorMessage: string }>;
        createdItemIds?: string[];
      }>("/items/bulk", payload);
      return res.data;
    },
    onSuccess: async (data, variables) => {
      const ids = data.createdItemIds ?? [];
      if (collectionId && ids.length > 0) {
        try {
          await collectionsApi.bulkAddItems(collectionId, { itemIds: ids });
        } catch (e) {
          console.error("Failed to add items to collection:", e);
        }
      }
      setResultModal({
        isOpen: true,
        message: `Saved ${data.createdCount} item(s).${data.duplicateCount ? ` ${data.duplicateCount} duplicate(s) skipped.` : ""}${data.failedCount ? ` ${data.failedCount} failed.` : ""}`,
        details: (data.errors ?? [])
          .map((e) => `Item ${e.index + 1}: ${e.errorMessage}`)
          .join("\n"),
      });
      setPendingItems((prev) => prev.filter((p) => !variables.some((v) => v.question === p.question)));
      if (pendingItems.length <= variables.length) {
        setStep("setup");
        setPendingItems([]);
      }
    },
    onError: (err: unknown) => {
      setLocalError(
        err && typeof err === "object" && "message" in err
          ? String((err as Error).message)
          : "Failed to save items."
      );
    },
  });

  const handleAcceptOne = (item: ParsedItem) => {
    bulkCreateMutation.mutate([item]);
  };

  const handleAcceptAll = () => {
    if (pendingItems.length === 0) return;
    bulkCreateMutation.mutate(pendingItems);
  };

  const handleRejectOne = (index: number) => {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRejectAll = () => {
    setPendingItems([]);
    setStep("paste");
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const primaryTopicError = validateKeywordFormat(primaryTopic);
  const subtopicError = validateKeywordFormat(subtopic);

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Bulk Create Items</h1>
        <p className="text-gray-600 text-sm mb-6">
          Choose a category and topics, generate a prompt for any AI assistant, paste the response, then review and save items.
        </p>

        {localError && (
          <div className="mb-4">
            <ErrorMessage message={localError} onRetry={() => setLocalError(null)} />
          </div>
        )}

        {step === "setup" && (
          <div className="bg-white shadow rounded-lg p-6 space-y-6">
            <h2 className="text-lg font-medium text-gray-900">1. Setup</h2>
            <p className="text-sm text-gray-500">
              Primary topic is the main subject under this category (e.g. a language or exam name). Subtopic narrows it further (e.g. a specific unit). These help you and others find your items in the app.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPrimaryTopic("");
                    setSubtopic("");
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.category}>
                      {c.category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary topic (rank 1) *</label>
                <select
                  value={rank1Keywords.some((k) => k.name === primaryTopic) ? primaryTopic : ""}
                  onChange={(e) => {
                    setPrimaryTopic(e.target.value);
                    setSubtopic("");
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Select or type below</option>
                  {rank1Keywords.map((k) => (
                    <option key={k.name} value={k.name}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={rank1Keywords.some((k) => k.name === primaryTopic) ? "" : primaryTopic}
                  onChange={(e) => setPrimaryTopic(e.target.value.slice(0, KEYWORD_MAX_LEN))}
                  placeholder="Or type custom (letters, numbers, hyphens)"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                {primaryTopicError && (
                  <p className="mt-1 text-xs text-red-600">{primaryTopicError}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtopic (rank 2)</label>
                <select
                  value={rank2Keywords.some((k) => k.name === subtopic) ? subtopic : ""}
                  onChange={(e) => setSubtopic(e.target.value)}
                  disabled={!primaryTopic}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Optional</option>
                  {rank2Keywords.map((k) => (
                    <option key={k.name} value={k.name}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={rank2Keywords.some((k) => k.name === subtopic) ? "" : subtopic}
                  onChange={(e) => setSubtopic(e.target.value.slice(0, KEYWORD_MAX_LEN))}
                  placeholder="Or type custom"
                  disabled={!primaryTopic}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                {subtopicError && <p className="mt-1 text-xs text-red-600">{subtopicError}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional keywords (comma-separated)</label>
                <input
                  type="text"
                  value={extraKeywordsText}
                  onChange={(e) => setExtraKeywordsText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="e.g. practice, exam"
                />
                <p className="mt-1 text-xs text-gray-500">These will be included in the prompt and attached to each item. Use letters, numbers, hyphens.</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Add to collection (optional)</label>
                <select
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">None</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleGeneratePrompt}
                disabled={!category || !primaryTopic.trim() || !!primaryTopicError || !!subtopicError}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                Generate Prompt
              </button>
              <button
                type="button"
                onClick={() => navigate("/categories")}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === "prompt" && (
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-medium text-gray-900">2. Copy prompt and paste into your AI assistant</h2>
            <p className="text-sm text-gray-500">
              Copy the prompt below, paste it into ChatGPT, Claude, or any AI assistant. Then paste the AI’s JSON response back into this app in the next step.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
                {copySuccess ? "Copied!" : "Copy prompt"}
              </button>
            </div>
            <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded border border-gray-200 overflow-x-auto">
              {generatedPrompt}
            </pre>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("paste")}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                I pasted the response →
              </button>
              <button
                type="button"
                onClick={() => setStep("setup")}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === "paste" && (
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-medium text-gray-900">3. Paste AI response</h2>
            <p className="text-sm text-gray-500">
              Paste the raw JSON array from your AI assistant below. Items will be checked; only those matching your selected category will be kept. You can then review and accept or reject each before saving.
            </p>
            <textarea
              value={pastedResponse}
              onChange={(e) => setPastedResponse(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
              placeholder='[ { "category": "...", "question": "...", ... }, ... ]'
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleParseAndReview}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                Import &amp; Review
              </button>
              <button
                type="button"
                onClick={() => setStep("prompt")}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-medium text-gray-900">4. Review items</h2>
            <p className="text-sm text-gray-500">
              Items are not saved yet. Accept to save to the database{collectionId ? " and add to your selected collection" : ""}. Reject to discard.
            </p>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={handleAcceptAll}
                disabled={pendingItems.length === 0 || bulkCreateMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckIcon className="h-4 w-4" /> Accept all ({pendingItems.length})
              </button>
              <button
                type="button"
                onClick={handleRejectAll}
                disabled={pendingItems.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-red-50 text-red-700 rounded-md hover:bg-red-100 disabled:opacity-50"
              >
                <XMarkIcon className="h-4 w-4" /> Reject all
              </button>
            </div>
            <ul className="space-y-3 divide-y divide-gray-200">
              {pendingItems.map((item, index) => (
                <li key={index} className="pt-3 first:pt-0">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.question}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        ✓ {item.correctAnswer}
                        {item.incorrectAnswers.length > 0 && (
                          <> · ✗ {item.incorrectAnswers.join(", ")}</>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleAcceptOne(item)}
                        disabled={bulkCreateMutation.isPending}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                        title="Accept"
                      >
                        <CheckIcon className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectOne(index)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        title="Reject"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {pendingItems.length === 0 && (
              <p className="text-sm text-gray-500">No items left. Go back to paste again or start over.</p>
            )}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setStep("paste")}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to paste
              </button>
              <button
                type="button"
                onClick={() => { setPendingItems([]); setStep("setup"); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Start over
              </button>
            </div>
          </div>
        )}
      </div>

      {resultModal.isOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
          onClick={() => setResultModal({ isOpen: false, message: "", details: "" })}
        >
          <div
            className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Bulk Create Results</h3>
              <button
                onClick={() => setResultModal({ isOpen: false, message: "", details: "" })}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="text-sm text-gray-700 mb-4">{resultModal.message}</p>
            {resultModal.details && (
              <textarea
                readOnly
                value={resultModal.details}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono bg-gray-50 resize-none"
                rows={6}
              />
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  setResultModal({ isOpen: false, message: "", details: "" });
                  navigate("/categories");
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkCreateItemsPage;
