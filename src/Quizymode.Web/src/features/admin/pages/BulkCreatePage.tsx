import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import ErrorMessage from "@/components/ErrorMessage";
import { categoriesApi } from "@/api/categories";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface BulkCreateRequest {
  isPrivate: boolean;
  items: Array<{
    category: string;
    subcategory: string;
    question: string;
    correctAnswer: string;
    incorrectAnswers: string[];
    explanation: string;
  }>;
}

const BulkCreatePage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [jsonInput, setJsonInput] = useState("");
  const [category, setCategory] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [validationError, setValidationError] = useState<string>("");
  const [isPromptExampleOpen, setIsPromptExampleOpen] = useState(false);
  const [resultModal, setResultModal] = useState<{
    isOpen: boolean;
    message: string;
    details: string;
  }>({ isOpen: false, message: "", details: "" });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (data: BulkCreateRequest) => {
      // API expects IsPrivate and Items array where each item has Category
      const apiRequest = {
        isPrivate: data.isPrivate,
        items: data.items.map((item) => ({
          category: item.category,
          subcategory: item.subcategory,
          question: item.question,
          correctAnswer: item.correctAnswer,
          incorrectAnswers: item.incorrectAnswers,
          explanation: item.explanation || "",
        })),
      };

      // Use apiClient directly since API expects different structure than adminApi
      const response = await apiClient.post<{
        totalRequested: number;
        createdCount: number;
        duplicateCount: number;
        failedCount: number;
        duplicateQuestions: string[];
        errors: Array<{
          index: number;
          question: string;
          errorMessage: string;
        }>;
      }>("/items/bulk", apiRequest);
      return response.data;
    },
    onSuccess: (response) => {
      let message = `Successfully created ${response.createdCount} items.`;
      let details = "";

      if (response.duplicateCount > 0) {
        message += ` ${response.duplicateCount} duplicates skipped.`;
      }
      if (response.failedCount > 0) {
        message += ` ${response.failedCount} failed.`;
        if (response.errors && response.errors.length > 0) {
          const errorDetails = response.errors
            .map((err) => `Item ${err.index + 1}: ${err.errorMessage}`)
            .join("\n");
          details += `Errors:\n${errorDetails}\n\n`;
        }
        if (
          response.duplicateQuestions &&
          response.duplicateQuestions.length > 0
        ) {
          details += `Duplicate questions:\n${response.duplicateQuestions.join(
            "\n"
          )}`;
        }
      }

      setResultModal({
        isOpen: true,
        message,
        details,
      });

      if (response.createdCount > 0 && response.failedCount === 0) {
        // Only auto-navigate if all items succeeded
        setTimeout(() => {
          navigate("/admin");
        }, 2000);
      }
    },
    onError: (error: any) => {
      console.error("Failed to bulk create items:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (!jsonInput.trim()) {
      setValidationError("JSON input is required");
      return;
    }

    try {
      const parsedItems = JSON.parse(jsonInput);

      if (!Array.isArray(parsedItems)) {
        setValidationError("JSON must be an array of items");
        return;
      }

      if (parsedItems.length === 0) {
        setValidationError("At least one item is required");
        return;
      }

      if (parsedItems.length > 100) {
        setValidationError("Cannot create more than 100 items at once");
        return;
      }

      // Validate each item structure
      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];
        if (
          !item.category ||
          !item.subcategory ||
          !item.question ||
          !item.correctAnswer
        ) {
          setValidationError(
            `Item ${
              i + 1
            } is missing required fields (category, subcategory, question, or correctAnswer)`
          );
          return;
        }
        if (!Array.isArray(item.incorrectAnswers)) {
          setValidationError(
            `Item ${i + 1}: incorrectAnswers must be an array`
          );
          return;
        }
        if (item.incorrectAnswers.length > 4) {
          setValidationError(
            `Item ${i + 1}: cannot have more than 4 incorrect answers`
          );
          return;
        }
      }

      // Validate that all items have category or category override is provided
      const itemsWithoutCategory = parsedItems.filter(
        (item: any) => !item.category
      );
      if (itemsWithoutCategory.length > 0 && !category.trim()) {
        setValidationError(
          `Items ${itemsWithoutCategory
            .map(
              (_: any, i: number) =>
                parsedItems.indexOf(itemsWithoutCategory[i]) + 1
            )
            .join(
              ", "
            )} are missing category field and no category override is provided`
        );
        return;
      }

      const request: BulkCreateRequest = {
        isPrivate,
        items: parsedItems.map((item: any) => ({
          // Category override replaces category in JSON if provided
          category: (category.trim() || item.category || "").trim(),
          subcategory: item.subcategory.trim(),
          question: item.question.trim(),
          correctAnswer: item.correctAnswer.trim(),
          incorrectAnswers: Array.isArray(item.incorrectAnswers)
            ? item.incorrectAnswers
                .map((ans: any) => String(ans).trim())
                .filter((ans: string) => ans.length > 0)
            : [],
          explanation: item.explanation ? String(item.explanation).trim() : "",
        })),
      };

      bulkCreateMutation.mutate(request);
    } catch (error) {
      setValidationError(
        `Invalid JSON: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Bulk Create Items
        </h1>

        <div className="mb-6 space-y-4">
          <p className="text-gray-700">
            You can add a batch of flashcard items here by pasting a JSON array
            in the format shown in the sample prompt below. You can write it
            yourself or ask an AI (e.g. ChatGPT or Claude) to generate it for
            you using the sample prompt.
          </p>
          <p className="text-gray-700">
            Regular users can add only Private items (visible only to this
            user). Admins can add items visible to everyone.
          </p>
        </div>

        <div className="bg-white border border-gray-300 rounded-lg mb-6">
          <button
            type="button"
            onClick={() => setIsPromptExampleOpen(!isPromptExampleOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-900">
              🔽 AI Prompt Example (copyable text)
            </span>
            {isPromptExampleOpen ? (
              <ChevronUpIcon className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-gray-500" />
            )}
          </button>
          {isPromptExampleOpen && (
            <div className="px-4 pb-4 border-t border-gray-200">
              <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono mt-4">
                {`You are creating study flashcards for an app called Quizymode.

Create up to 100 quiz items about <replace-me: Topic or Category Name>, specifically about <replace-me: Subcategory Names>.

Each item must be a JSON object with this exact shape:

{
  "category": "Category Name (e.g. Spanish, US History, or ACT)",
  "subcategory": "Subcategory Name (e.g. Greetings or ACT Math)",
  "question": "Question text?",
  "correctAnswer": "Correct answer",
  "incorrectAnswers": ["Wrong answer 1", "Wrong answer 2", "Wrong answer 3"],
  "explanation": "Short explanation of why the correct answer is right (optional but recommended)"
}

Requirements:
- Return a single JSON array of items: [ { ... }, { ... }, ... ].
- Do NOT include any explanations, prose, comments, Markdown, or code fences. Output raw JSON only.
- Every item must have:
  - "category" (max 50 characters)
  - "subcategory" (max 50 characters)
  - a non-empty "question" (max 1,000 characters)
  - a non-empty "correctAnswer" (max 200 characters)
  - 1–5 "incorrectAnswers" (each max 200 characters)
- All strings must be plain text (no HTML, no LaTeX).

Now generate the JSON array only.`}
              </pre>
            </div>
          )}
        </div>

        {validationError && (
          <div className="mb-4">
            <ErrorMessage
              message={validationError}
              onRetry={() => setValidationError("")}
            />
          </div>
        )}

        {bulkCreateMutation.isError && (
          <div className="mb-4">
            <ErrorMessage
              message={
                bulkCreateMutation.error &&
                (bulkCreateMutation.error as any).response?.data
                  ? Array.isArray(
                      (bulkCreateMutation.error as any).response.data
                    )
                    ? (bulkCreateMutation.error as any).response.data
                        .map(
                          (err: any) =>
                            err.errorMessage ||
                            err.message ||
                            JSON.stringify(err)
                        )
                        .join(", ")
                    : typeof (bulkCreateMutation.error as any).response.data ===
                      "string"
                    ? (bulkCreateMutation.error as any).response.data
                    : (bulkCreateMutation.error as any).response.data.title ||
                      (bulkCreateMutation.error as any).response.data.detail ||
                      "Failed to bulk create items"
                  : bulkCreateMutation.error instanceof Error
                  ? bulkCreateMutation.error.message
                  : "Failed to bulk create items. Please check the browser console for details."
              }
              onRetry={() => bulkCreateMutation.reset()}
            />
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow rounded-lg p-6 space-y-6"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category Override (optional)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select a category (optional)</option>
              {categoriesData?.categories.map((cat) => (
                <option key={cat.category} value={cat.category}>
                  {cat.category}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              If you select a category here, it will override the "category"
              field inside every JSON item you upload. Leave empty to keep
              category values from your JSON.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Items JSON *
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              required
              rows={15}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
              placeholder='[\n  {\n    "category": "Category",\n    "subcategory": "Subcategory",\n    "question": "Question?",\n    "correctAnswer": "Answer",\n    "incorrectAnswers": ["Wrong 1", "Wrong 2"],\n    "explanation": "Explanation"\n  }\n]'
            />
            <p className="mt-1 text-sm text-gray-500">
              Paste your JSON array here (up to 100 items). If you selected a
              Category Override above, it will replace the "category" field in
              every item.
            </p>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Private Items
              </span>
            </label>
            <p className="mt-1 ml-6 text-sm text-gray-500">
              Private items are visible only to your account.
            </p>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={bulkCreateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {bulkCreateMutation.isPending ? "Creating..." : "Create Items"}
            </button>
          </div>
        </form>
      </div>

      {/* Result Modal */}
      {resultModal.isOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
          onClick={() =>
            setResultModal({ isOpen: false, message: "", details: "" })
          }
        >
          <div
            className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Bulk Create Results
              </h3>
              <button
                onClick={() =>
                  setResultModal({ isOpen: false, message: "", details: "" })
                }
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {resultModal.message}
                </p>
              </div>

              {resultModal.details && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Details (selectable):
                  </label>
                  <textarea
                    readOnly
                    value={resultModal.details}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono bg-gray-50 text-gray-800 resize-none"
                    rows={15}
                    onClick={(e) => e.currentTarget.select()}
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setResultModal({ isOpen: false, message: "", details: "" });
                    if (
                      resultModal.message.includes("Successfully created") &&
                      !resultModal.details
                    ) {
                      navigate("/admin");
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkCreatePage;
