import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { categoriesApi } from "@/api/categories";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

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

const BulkCreateItemsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [jsonInput, setJsonInput] = useState("");
  const [category, setCategory] = useState("");
  const [isPrivate, setIsPrivate] = useState(!isAdmin); // Default to true for non-admin
  const [validationError, setValidationError] = useState<string>("");

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
      
      const response = await apiClient.post<{
        totalRequested: number;
        createdCount: number;
        duplicateCount: number;
        failedCount: number;
        duplicateQuestions: string[];
        errors: Array<{ index: number; question: string; errorMessage: string }>;
      }>('/items/bulk', apiRequest);
      return response.data;
    },
    onSuccess: (response) => {
      const message = `Successfully created ${response.createdCount} items. ${response.duplicateCount} duplicates skipped. ${response.failedCount} failed.`;
      alert(message);
      navigate("/my-items");
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
        if (!item.category || !item.subcategory || !item.question || !item.correctAnswer) {
          setValidationError(`Item ${i + 1} is missing required fields (category, subcategory, question, or correctAnswer)`);
          return;
        }
        if (!Array.isArray(item.incorrectAnswers)) {
          setValidationError(`Item ${i + 1}: incorrectAnswers must be an array`);
          return;
        }
        if (item.incorrectAnswers.length > 4) {
          setValidationError(`Item ${i + 1}: cannot have more than 4 incorrect answers`);
          return;
        }
      }

      // Validate that all items have category or fallback category is provided
      const itemsWithoutCategory = parsedItems.filter((item: any) => !item.category);
      if (itemsWithoutCategory.length > 0 && !category.trim()) {
        setValidationError(`Items ${itemsWithoutCategory.map((_: any, i: number) => parsedItems.indexOf(itemsWithoutCategory[i]) + 1).join(', ')} are missing category field and no default category is provided`);
        return;
      }

      const request: BulkCreateRequest = {
        isPrivate,
        items: parsedItems.map((item: any) => ({
          category: (item.category || category).trim(),
          subcategory: item.subcategory.trim(),
          question: item.question.trim(),
          correctAnswer: item.correctAnswer.trim(),
          incorrectAnswers: Array.isArray(item.incorrectAnswers)
            ? item.incorrectAnswers.map((ans: any) => String(ans).trim()).filter((ans: string) => ans.length > 0)
            : [],
          explanation: item.explanation ? String(item.explanation).trim() : "",
        })),
      };

      bulkCreateMutation.mutate(request);
    } catch (error) {
      setValidationError(`Invalid JSON: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Bulk Create Items</h1>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-blue-900 mb-2">JSON Format:</h3>
          <pre className="text-xs text-blue-800 overflow-x-auto">
{`[
  {
    "category": "Category Name",
    "subcategory": "Subcategory Name",
    "question": "Question text?",
    "correctAnswer": "Correct answer",
    "incorrectAnswers": ["Wrong answer 1", "Wrong answer 2"],
    "explanation": "Optional explanation"
  }
]`}
          </pre>
        </div>

        {validationError && (
          <div className="mb-4">
            <ErrorMessage message={validationError} onRetry={() => setValidationError("")} />
          </div>
        )}

        {bulkCreateMutation.isError && (
          <div className="mb-4">
            <ErrorMessage
              message={
                bulkCreateMutation.error && (bulkCreateMutation.error as any).response?.data
                  ? Array.isArray((bulkCreateMutation.error as any).response.data)
                    ? (bulkCreateMutation.error as any).response.data
                        .map((err: any) => err.errorMessage || err.message || JSON.stringify(err))
                        .join(", ")
                    : typeof (bulkCreateMutation.error as any).response.data === "string"
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

        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Each item in the JSON must include a "category" field. 
              The category dropdown below is only used as a fallback if items don't specify a category.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Category (fallback if not in JSON)
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
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mr-2"
                disabled={!isAdmin}
              />
              <span className="text-sm font-medium text-gray-700">
                Private Items {!isAdmin && "(default for non-admin users)"}
              </span>
            </label>
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
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate("/my-items")}
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
    </div>
  );
};

export default BulkCreateItemsPage;

