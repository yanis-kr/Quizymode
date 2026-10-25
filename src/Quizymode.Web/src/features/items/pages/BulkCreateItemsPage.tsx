/**
 * Generate one AI batch: choose scope and keywords, create a prompt for 10-15 private items,
 * copy it to AI, paste the response, review in memory, then accept/reject before saving.
 */
import { getIncorrectAnswerConflict } from "@/utils/incorrectAnswerRules";
import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCollection } from "@/hooks/useActiveCollection";
import { Navigate } from "react-router-dom";
import ErrorMessage from "@/components/ErrorMessage";
import { apiClient } from "@/api/client";
import { collectionsApi } from "@/api/collections";
import {
  XMarkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { ItemTopicScopeFields, type TopicScopeFieldsHandle } from "@/components/items/ItemTopicScopeFields";
import { applyTopicScopePatch, isTopicComplete, TOPIC_REQUIRED_MESSAGE } from "@/features/topics/topicScope";
import { useTaxonomy } from "@/features/topics/useTaxonomy";
import { validateNavigationKeywordName } from "@/utils/navigationKeywordRules";
import ContentComplianceNotice from "@/features/legal/components/ContentComplianceNotice";
import { ActiveCollectionNotice } from "@/components/items/ActiveCollectionNotice";
import { parseCloze, CLOZE_AI_HELPER_PROMPT, type ClozeSkipped } from "@/features/items/utils/clozeParser";
import {
  ADMIN_ITEM_LIMIT,
  NON_ADMIN_ITEM_LIMIT,
} from "@/features/collections/utils/importParser";

const MAX_PROMPT_QUESTIONS = 15;

type Step = "setup" | "prompt" | "paste" | "review";
type PasteFormat = "json" | "cloze";

const CLOZE_PLACEHOLDER =
  "{{c1::Paris}} is the capital of France | Lyon | Marseille\n{{c1::France}}'s capital is {{c2::Paris}} | c1: Spain | c2: Rome";
const CLOZE_HELP_ID = "bulk-cloze-help";
const SKIPPED_PREVIEW_COUNT = 5;

interface ClozeReport {
  skipped: ClozeSkipped[];
  duplicates: number;
  truncated: boolean;
  limit: number;
}

interface ParsedItem {
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  source?: string;
  /** AI-only tags (merged with setup scope on save). */
  keywords?: string[];
  /** Nav + user extras + AI tags, deduped (case-insensitive); for review display. */
  consolidatedKeywords: string[];
  /** Set for cloze imports: position among cards kept from the same pasted line. */
  clozeOrigin?: { line: number; card: number; count: number };
}

/** Comma-separated extras from setup, trim + dedupe by case, preserve first spelling. */
function parseExtraKeywordsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
  }
  return out;
}

/** Single ordered list: navigation, then user extras, then AI suggestions; dedupe case-insensitive. */
function consolidateBulkItemKeywords(
  nav: string[],
  extrasFromText: string[],
  aiTags: string[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const bucket of [nav, extrasFromText, aiTags]) {
    for (const raw of bucket) {
      const t = raw.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

const BulkCreateItemsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const { activeCollectionId, activeCollection } = useActiveCollection();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCategory = searchParams.get("category") ?? "";
  const urlKeywordsParam = searchParams.get("keywords");
  const urlKeywords = useMemo(
    () => urlKeywordsParam?.split(",").filter(Boolean) ?? [],
    [urlKeywordsParam]
  );
  const urlAppliedRef = useRef(false);

  const [step, setStep] = useState<Step>("setup");
  const [category, setCategory] = useState("");
  const [primaryTopic, setPrimaryTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [extraKeywordsText, setExtraKeywordsText] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [pastedResponse, setPastedResponse] = useState("");
  const [pastedCloze, setPastedCloze] = useState("");
  const [pasteFormat, setPasteFormat] = useState<PasteFormat>("json");
  const [clozeReport, setClozeReport] = useState<ClozeReport | null>(null);
  const [copyHelperSuccess, setCopyHelperSuccess] = useState(false);
  const [pendingItems, setPendingItems] = useState<ParsedItem[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [skippedNoDistractors, setSkippedNoDistractors] = useState(0);
  const [skippedConflicts, setSkippedConflicts] = useState(0);
  const [resultModal, setResultModal] = useState<{
    isOpen: boolean;
    message: string;
    details: string;
  }>({ isOpen: false, message: "", details: "" });

  const { data: taxonomyData } = useTaxonomy(isAuthenticated);
  const [topicBlocked, setTopicBlocked] = useState(false);
  const topicScopeRef = useRef<TopicScopeFieldsHandle>(null);

  const categoryOptions = useMemo(() => {
    const rows = (taxonomyData?.categories ?? []).map((c) => ({
      category: c.slug,
    }));
    return [...rows].sort((a, b) => a.category.localeCompare(b.category));
  }, [taxonomyData]);

  // Apply the URL prefill once (after the taxonomy loads) so "Remove topic" can clear it.
  useEffect(() => {
    if (urlAppliedRef.current || categoryOptions.length === 0) return;
    urlAppliedRef.current = true;
    if (urlCategory && categoryOptions.some((c) => c.category === urlCategory)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(urlCategory);
    }
    if (urlKeywords.length > 0) {
      setPrimaryTopic(urlKeywords[0] ?? "");
      if (urlKeywords.length > 1) setSubtopic(urlKeywords[1] ?? "");
    }
  }, [urlCategory, urlKeywords, categoryOptions]);

  const navKeywords = useMemo(
    () => [primaryTopic.trim(), subtopic.trim()].filter(Boolean),
    [primaryTopic, subtopic]
  );

  const extraKeywords = useMemo(
    () =>
      extraKeywordsText
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [extraKeywordsText]
  );

  /** Shared scope validation for "Generate AI Prompt" and "Paste cloze text". Sets localError and returns false on failure. */
  const validateScope = (): boolean => {
    setLocalError(null);
    setTopicBlocked(false);
    if (!isTopicComplete({ category, rank1: primaryTopic, rank2: subtopic })) {
      setTopicBlocked(true);
      topicScopeRef.current?.focus();
      return false;
    }
    const r1Err = validateNavigationKeywordName(primaryTopic);
    const r2Err = validateNavigationKeywordName(subtopic);
    if (r1Err || r2Err) {
      setLocalError(r1Err || r2Err || "");
      return false;
    }
    return true;
  };

  const clearReports = () => {
    setSkippedNoDistractors(0);
    setSkippedConflicts(0);
    setClozeReport(null);
  };

  const handlePasteCloze = () => {
    if (!validateScope()) return;
    clearReports();
    setPasteFormat("cloze");
    setStep("paste");
  };

  const handleSelectFormat = (format: PasteFormat) => {
    if (format === pasteFormat) return;
    setLocalError(null);
    clearReports();
    setPasteFormat(format);
  };

  const handleGeneratePrompt = () => {
    if (!validateScope()) return;
    const navLine = `${primaryTopic.trim()} → ${subtopic.trim()}`;
    const extraLine =
      extraKeywords.length > 0 ? ` Tags to include on each item: ${extraKeywords.join(", ")}.` : "";
    const reservedTagsHint =
      extraKeywords.length > 0
        ? ` Do not repeat these user-supplied tags: ${extraKeywords.join(", ")}.`
        : "";
    const prompt = `You are creating new private quiz items for an app called Quizymode.

Create 10 to ${MAX_PROMPT_QUESTIONS} new quiz items for:
- Category: ${category}
- Topic: ${navLine}
${extraLine}

Each item must be a JSON object with this exact shape:
{
  "category": "${category}",
  "navigationKeyword1": "${primaryTopic.trim()}",
  "navigationKeyword2": "${subtopic.trim()}",
  "question": "Question text?",
  "correctAnswer": "Correct answer",
  "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
  "keywords": ["optional-extra-tag-1", "optional-extra-tag-2"],
  "explanation": "Short explanation (optional but recommended)",
  "source": "https://example.com/reliable-reference"
}

Requirements:
- Return a single JSON array of items: [ { ... }, { ... }, ... ].
- Do NOT include any explanations, prose, comments, Markdown, or code fences. Output raw JSON only.
- Every item must have: "category", exact "navigationKeyword1", exact "navigationKeyword2", non-empty "question", non-empty "correctAnswer", 1-4 "incorrectAnswers", optional "explanation" and "source".
- Use "${primaryTopic.trim()}" for "navigationKeyword1" and "${subtopic.trim()}" for "navigationKeyword2" on every item. These fields must not be moved into "keywords".
- If you include "source", it must be a direct URL to a reliable, verifiable source for that fact or question. Prefer official documentation, standards bodies, government/education sites, textbooks, or other authoritative references. Do not use the AI assistant name as the source.
- Optional "keywords": up to 5 extra tags per item (letters, numbers, hyphens only; lowercase recommended). Suggest tags that help discovery (skills, subthemes, standards) for that specific question. Do not repeat the navigation topic path ("${navLine}") or the category name as tags; omit "keywords" or use [] if none.${reservedTagsHint}
- All strings must be plain text (no HTML, no LaTeX).
- Field length limits: "question" max 1000 chars; "correctAnswer" and each "incorrectAnswers" item max 500 chars; "source" max 1000 chars (URL only); "explanation" max 4000 chars. Truncate if needed.
- Keep the questions varied and avoid near-duplicates.

Generate the JSON array only.`;

    setGeneratedPrompt(prompt);
    clearReports();
    setPasteFormat("json");
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

  const handleCopyHelperPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CLOZE_AI_HELPER_PROMPT);
      setCopyHelperSuccess(true);
      setTimeout(() => setCopyHelperSuccess(false), 2000);
    } catch (e) {
      console.error(e);
      setLocalError("Could not copy automatically. Select the prompt text and copy it manually.");
    }
  };

  const handleParseCloze = () => {
    setLocalError(null);
    clearReports();
    if (!pastedCloze.trim()) {
      setLocalError("Paste your cloze text first.");
      return;
    }
    try {
      const limit = isAdmin ? ADMIN_ITEM_LIMIT : NON_ADMIN_ITEM_LIMIT;
      const result = parseCloze(pastedCloze, { limit });
      const report: ClozeReport = {
        skipped: result.skipped,
        duplicates: result.duplicates,
        truncated: result.truncated,
        limit,
      };
      setClozeReport(report);
      if (result.drafts.length === 0) {
        setLocalError(
          `No valid cards found. ${result.skipped.length} line(s) skipped; see the details below.`
        );
        return;
      }
      const consolidatedKeywords = consolidateBulkItemKeywords(
        navKeywords,
        parseExtraKeywordsFromText(extraKeywordsText),
        []
      );
      setPendingItems(
        result.drafts.map((d) => ({
          question: d.question,
          correctAnswer: d.correctAnswer,
          incorrectAnswers: d.incorrectAnswers,
          explanation: d.explanation,
          keywords: undefined,
          consolidatedKeywords,
          clozeOrigin: { line: d.sourceLine, card: d.cardPosition, count: d.cardCount },
        }))
      );
      setStep("review");
    } catch {
      setLocalError("Could not read the pasted text.");
    }
  };

  const handleParseAndReview = () => {
    if (pasteFormat === "cloze") {
      handleParseCloze();
      return;
    }
    setLocalError(null);
    clearReports();
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
      const reservedKeywordLower = new Set<string>();
      const catLower = selectedCategory.toLowerCase();
      if (catLower) reservedKeywordLower.add(catLower);
      navKeywords.forEach((n) => {
        const t = n.trim().toLowerCase();
        if (t) reservedKeywordLower.add(t);
      });
      extraKeywords.forEach((n) => {
        if (n) reservedKeywordLower.add(n);
      });

      const extrasFromText = parseExtraKeywordsFromText(extraKeywordsText);

      const items: ParsedItem[] = [];
      let skippedCount = 0;
      let conflictCount = 0;
      for (let i = 0; i < parsed.length; i++) {
        const o = parsed[i] as Record<string, unknown>;
        const itemCategory = (o.category ?? "").toString().trim();
        if (selectedCategory && itemCategory.toLowerCase() !== selectedCategory.toLowerCase()) {
          continue;
        }
        const navigationKeyword1 = (o.navigationKeyword1 ?? "").toString().trim();
        const navigationKeyword2 = (o.navigationKeyword2 ?? "").toString().trim();
        if (navigationKeyword1 && navigationKeyword1.toLowerCase() !== primaryTopic.trim().toLowerCase()) {
          continue;
        }
        if (navigationKeyword2 && navigationKeyword2.toLowerCase() !== subtopic.trim().toLowerCase()) {
          continue;
        }
        const question = (o.question ?? "").toString().trim();
        const correctAnswer = (o.correctAnswer ?? "").toString().trim();
        if (!question || !correctAnswer) continue;
        let incorrectAnswers: string[] = [];
        if (Array.isArray(o.incorrectAnswers)) {
          incorrectAnswers = o.incorrectAnswers.map((a) => String(a).trim()).filter(Boolean);
        }
        if (incorrectAnswers.length === 0) {
          skippedCount += 1;
          continue;
        }
        const slicedIncorrectAnswers = incorrectAnswers.slice(0, 4);
        if (getIncorrectAnswerConflict(correctAnswer, slicedIncorrectAnswers)) {
          conflictCount += 1;
          continue;
        }
        const explanation = (o.explanation ?? "").toString().trim();
        const rawSource = (o.source ?? "").toString().trim();
        const source = rawSource ? rawSource.slice(0, 1000) : undefined;
        const keywords: string[] = [];
        if (Array.isArray(o.keywords)) {
          const raw = (o.keywords as (string | { name?: string })[]).map((k) =>
            typeof k === "string" ? k : ((k as { name?: string }).name ?? "")
          );
          const seen = new Set<string>();
          for (const k of raw) {
            const trimmed = k.trim();
            if (!trimmed) continue;
            if (validateNavigationKeywordName(trimmed)) continue;
            const lower = trimmed.toLowerCase();
            if (reservedKeywordLower.has(lower) || seen.has(lower)) continue;
            seen.add(lower);
            keywords.push(trimmed);
            if (keywords.length >= 5) break;
          }
        }
        const consolidatedKeywords = consolidateBulkItemKeywords(
          navKeywords,
          extrasFromText,
          keywords
        );
        items.push({
          question,
          correctAnswer,
          incorrectAnswers: slicedIncorrectAnswers,
          explanation,
          source,
          keywords: keywords.length > 0 ? keywords : undefined,
          consolidatedKeywords,
        });
      }
      setSkippedNoDistractors(skippedCount);
      setSkippedConflicts(conflictCount);
      if (items.length === 0) {
        const reasons: string[] = [];
        if (skippedCount > 0) {
          reasons.push(`${skippedCount} item(s) skipped because they have no incorrect answers (1-4 required)`);
        }
        if (conflictCount > 0) {
          reasons.push(
            `${conflictCount} item(s) skipped because their incorrect answers repeat each other or the correct answer`
          );
        }
        setLocalError(
          reasons.length > 0
            ? `No valid items found: ${reasons.join("; ")}.`
            : "No valid items found in the response, or category did not match."
        );
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
      const defaultExtraRequests: { name: string; isPrivate: boolean }[] = [];
      extraKeywords.forEach((name) => {
        const trimmed = name.trim();
        if (
          trimmed &&
          !defaultExtraRequests.some((k) => k.name.toLowerCase() === trimmed.toLowerCase())
        ) {
          defaultExtraRequests.push({ name: trimmed, isPrivate: true });
        }
      });
      const payload = {
        isPrivate: true,
        category: category,
        keyword1: primaryTopic.trim(),
        keyword2: subtopic.trim(),
        keywords: defaultExtraRequests,
        items: itemsToSave.map((item) => {
          const aiExtras =
            (item.keywords ?? [])
              .map((k) => k.trim())
              .filter(Boolean)
              .map((k) => ({ name: k, isPrivate: true as boolean }));
          return {
            question: item.question,
            correctAnswer: item.correctAnswer,
            incorrectAnswers: item.incorrectAnswers,
            explanation: item.explanation || "",
            keywords: aiExtras.length > 0 ? aiExtras : undefined,
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
    onSuccess: (data, variables) => {
      if (activeCollectionId && data.createdItemIds && data.createdItemIds.length > 0) {
        collectionsApi
          .bulkAddItems(activeCollectionId, { itemIds: data.createdItemIds })
          .catch(() => {});
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
    setClozeReport(null);
    setStep("paste");
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const primaryTopicError = validateNavigationKeywordName(primaryTopic);
  const subtopicError = validateNavigationKeywordName(subtopic);
  const scopeIncomplete =
    !category ||
    !primaryTopic.trim() ||
    !subtopic.trim() ||
    !!primaryTopicError ||
    !!subtopicError;

  const renderClozeReport = () => {
    if (!clozeReport) return null;
    const { skipped, duplicates, truncated, limit } = clozeReport;
    if (skipped.length === 0 && duplicates === 0 && !truncated) return null;
    const renderSkipped = (s: ClozeSkipped, i: number) => (
      <li key={i}>
        Line {s.line}
        {s.card !== undefined ? ` (c${s.card})` : ""}: {s.reason}
      </li>
    );
    return (
      <div className="mb-2 space-y-1">
        {skipped.length > 0 && (
          <div>
            <p role="status" className="text-sm text-amber-700">
              {skipped.length} line(s) or card(s) skipped.
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-amber-700 break-words">
              {skipped.slice(0, SKIPPED_PREVIEW_COUNT).map(renderSkipped)}
            </ul>
            {skipped.length > SKIPPED_PREVIEW_COUNT && (
              <details className="pl-5 text-xs text-amber-700">
                <summary className="cursor-pointer">
                  Show {skipped.length - SKIPPED_PREVIEW_COUNT} more
                </summary>
                <ul className="mt-1 list-disc pl-5 break-words">
                  {skipped.slice(SKIPPED_PREVIEW_COUNT).map((s, i) => renderSkipped(s, i + SKIPPED_PREVIEW_COUNT))}
                </ul>
              </details>
            )}
          </div>
        )}
        {duplicates > 0 && (
          <p role="status" className="text-sm text-amber-700">
            {duplicates} duplicate card(s) removed (same question text already in this batch).
          </p>
        )}
        {truncated && (
          <p role="status" className="text-sm text-amber-700">
            Only the first {limit} cards were kept. Split the rest into another import.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Generate One AI Batch</h1>
        <p className="text-gray-600 text-sm mb-6">
          Choose a category and topic path, generate a prompt for any AI assistant, paste the response, then review and save 10-15 new private items.
        </p>

        <ContentComplianceNotice />
        <ActiveCollectionNotice />

        {localError && (
          <div className="mb-4">
            <ErrorMessage message={localError} onRetry={() => setLocalError(null)} />
          </div>
        )}

        {step === "setup" && (
          <div className="bg-white shadow rounded-lg p-6 space-y-6">
            <h2 className="text-lg font-medium text-gray-900">1. Scope</h2>
            <section className="rounded-lg border border-gray-200 bg-slate-50/80 p-4 sm:p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Topic and tags</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Same scope fields as when you add a single item: category, primary topic, and subtopic are required.
                  Optional comma-separated tags apply to every saved item and appear in the AI prompt.
                </p>
              </div>
              <ItemTopicScopeFields
                idPrefix="bulk-topic-scope"
                ref={topicScopeRef}
                category={category}
                rank1={primaryTopic}
                rank2={subtopic}
                onScopeChange={(patch) => {
                  const next = applyTopicScopePatch(
                    { category, rank1: primaryTopic, rank2: subtopic },
                    patch
                  );
                  setCategory(next.category);
                  setPrimaryTopic(next.rank1);
                  setSubtopic(next.rank2);
                }}
                error={
                  topicBlocked && !isTopicComplete({ category, rank1: primaryTopic, rank2: subtopic })
                    ? TOPIC_REQUIRED_MESSAGE
                    : undefined
                }
              />
              <div className="pt-4 border-t border-gray-200/90">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional keywords (comma-separated, optional)
                </label>
                <input
                  type="text"
                  value={extraKeywordsText}
                  onChange={(e) => setExtraKeywordsText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  placeholder="e.g. practice, exam-prep"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Included in the prompt and attached to each saved item. Use letters, numbers, and hyphens per tag.
                </p>
              </div>
            </section>
            <p className="text-xs text-gray-500">
              Already have cloze-style notes? Skip the AI prompt and paste them directly.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={handleGeneratePrompt}
                disabled={scopeIncomplete}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                Generate AI Prompt
              </button>
              <button
                type="button"
                onClick={handlePasteCloze}
                disabled={scopeIncomplete}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-indigo-700 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50 disabled:opacity-50"
              >
                Paste cloze text
              </button>
              <button
                type="button"
                onClick={() => navigate("/categories")}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === "prompt" && (
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-medium text-gray-900">2. Copy prompt and run it in your AI assistant</h2>
            <p className="text-sm text-gray-500">
              Copy the prompt below, paste it into ChatGPT, Claude, or any AI assistant, and ask it for 10-15 new items. Then paste the AI response back into this app in the next step.
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
                onClick={() => {
                  setPasteFormat("json");
                  setStep("paste");
                }}
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
            <h2 className="text-lg font-medium text-gray-900">
              {pasteFormat === "cloze" ? "3. Paste cloze text" : "3. Paste AI response"}
            </h2>
            <div>
              <p id="bulk-paste-format-label" className="text-sm font-medium text-gray-700 mb-1">
                Format
              </p>
              <div
                role="radiogroup"
                aria-labelledby="bulk-paste-format-label"
                className="inline-flex w-full sm:w-auto rounded-md border border-gray-300 bg-white p-0.5"
              >
                {(
                  [
                    ["json", "AI JSON response"],
                    ["cloze", "Cloze text"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex-1 sm:flex-none text-center px-3 py-1.5 text-sm font-medium rounded cursor-pointer text-gray-700 has-[:checked]:bg-indigo-600 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500"
                  >
                    <input
                      type="radio"
                      name="bulk-paste-format"
                      value={value}
                      checked={pasteFormat === value}
                      onChange={() => handleSelectFormat(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {pasteFormat === "cloze" ? (
              <>
                <p className="text-sm text-gray-500">
                  {"One note per line. Wrap each answer in {{c1::answer}}. Add wrong answers after | at the end of the line (1-4 required)."}
                </p>
                <div
                  id={CLOZE_HELP_ID}
                  className="rounded-md border border-gray-200 bg-slate-50/80 p-3 text-xs text-gray-700 space-y-2"
                >
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      Same number = same card: <code className="text-xs bg-gray-100 px-1 rounded">{"{{c1::H}} and {{c1::O}}"}</code> blank together. Different numbers make separate cards.
                    </li>
                    <li>
                      Add a hint with <code className="text-xs bg-gray-100 px-1 rounded">{"{{c1::Paris::city}}"}</code>.
                    </li>
                    <li>
                      With several numbers, target one card by prefixing a wrong answer: <code className="text-xs bg-gray-100 px-1 rounded">| c1: Spain | c2: Rome</code>. Unprefixed wrong answers apply to every card on the line.
                    </li>
                    <li>
                      Need a literal | in an answer? Write <code className="text-xs bg-gray-100 px-1 rounded">{"\\|"}</code>.
                    </li>
                  </ul>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-white border border-gray-200 rounded p-2">
                    {CLOZE_PLACEHOLDER}
                  </pre>
                </div>
                <details>
                  <summary className="text-sm font-medium text-indigo-600 cursor-pointer">
                    Need an AI to write cloze notes? Copy a helper prompt
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleCopyHelperPrompt}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
                      >
                        <ClipboardDocumentIcon className="h-4 w-4" />
                        {copyHelperSuccess ? "Copied!" : "Copy helper prompt"}
                      </button>
                    </div>
                    <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto">
                      {CLOZE_AI_HELPER_PROMPT}
                    </pre>
                  </div>
                </details>
                <span className="sr-only" role="status" aria-live="polite">
                  {copyHelperSuccess ? "Helper prompt copied to clipboard." : ""}
                </span>
                <textarea
                  value={pastedCloze}
                  onChange={(e) => setPastedCloze(e.target.value)}
                  rows={12}
                  aria-describedby={CLOZE_HELP_ID}
                  aria-label="Cloze text, one note per line"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                  placeholder={CLOZE_PLACEHOLDER}
                />
                {pendingItems.length === 0 && renderClozeReport()}
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  Paste the raw JSON array from your AI assistant below. Items will be checked; only those matching your selected category will be kept. Optional per-item <code className="text-xs bg-gray-100 px-1 rounded">keywords</code> (up to five per item, format-valid and not duplicating your topic or extra tags) are merged with your setup tags on save. On the review step, each row shows that full combined tag list. You can then accept or reject each item before saving.
                </p>
                <textarea
                  value={pastedResponse}
                  onChange={(e) => setPastedResponse(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                  placeholder='[ { "category": "...", "question": "...", "keywords": ["tag-one"], ... }, ... ]'
                />
              </>
            )}
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
                onClick={() => {
                  setLocalError(null);
                  setStep(generatedPrompt ? "prompt" : "setup");
                }}
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
              Items are not saved yet. Accept to save them as private items. Reject to discard.
              Each row shows the full tag list: your category topics and optional extra tags from setup, plus any extra tags the AI suggested for that item (duplicates removed).
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
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
            {renderClozeReport()}
            {pendingItems.some((p) => p.clozeOrigin && p.clozeOrigin.count > 1) && (
              <p className="text-xs text-gray-500">
                Cards from the same line can reveal each other&apos;s answers when studied together. Reject any siblings you don&apos;t want.
              </p>
            )}
            {skippedNoDistractors > 0 && (
              <p className="text-sm text-amber-700 mb-2" role="status">
                {skippedNoDistractors} item(s) skipped: each item needs 1-4 incorrect answers.
              </p>
            )}
            {skippedConflicts > 0 && (
              <p className="text-sm text-amber-700 mb-2" role="status">
                {skippedConflicts} item(s) skipped: incorrect answers must be different from each other and from the correct answer.
              </p>
            )}
            <ul className="space-y-3 divide-y divide-gray-200">
              {pendingItems.map((item, index) => (
                <li key={index} className="pt-3 first:pt-0">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium text-gray-900${item.clozeOrigin ? " break-words" : ""}`}>
                        {item.question}
                      </p>
                      {item.clozeOrigin && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Card {item.clozeOrigin.card} of {item.clozeOrigin.count} from line {item.clozeOrigin.line}
                        </p>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        ✓ {item.correctAnswer}
                        {item.incorrectAnswers.length > 0 && (
                          <> · ✗ {item.incorrectAnswers.join(", ")}</>
                        )}
                      </p>
                      {item.consolidatedKeywords.length > 0 && (
                        <p className="text-xs text-indigo-700 mt-1">
                          Tags: {item.consolidatedKeywords.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleAcceptOne(item)}
                        disabled={bulkCreateMutation.isPending}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                        title="Accept"
                        aria-label={
                          item.clozeOrigin
                            ? `Accept card ${item.clozeOrigin.card} of ${item.clozeOrigin.count} from line ${item.clozeOrigin.line}`
                            : undefined
                        }
                      >
                        <CheckIcon className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectOne(index)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        title="Reject"
                        aria-label={
                          item.clozeOrigin
                            ? `Reject card ${item.clozeOrigin.card} of ${item.clozeOrigin.count} from line ${item.clozeOrigin.line}`
                            : undefined
                        }
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
              <h3 className="text-lg font-medium text-gray-900">AI Batch Results</h3>
              <button
                onClick={() => setResultModal({ isOpen: false, message: "", details: "" })}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="text-sm text-gray-700 mb-4">{resultModal.message}</p>
            {activeCollection?.isPublic && (
              <p className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                <span className="font-semibold">Public collection warning:</span> Items were added to{" "}
                <span className="font-medium">{activeCollection.name}</span>, which is public — they
                are accessible via its shareable link immediately.
              </p>
            )}
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
