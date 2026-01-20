import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import ErrorMessage from "@/components/ErrorMessage";
import { categoriesApi } from "@/api/categories";
import { useQuery } from "@tanstack/react-query";
import type { KeywordRequest } from "@/types/api";

const CreateItemPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    category: "",
    isPrivate: true, // Default to true for regular users
    question: "",
    correctAnswer: "",
    incorrectAnswers: ["", "", ""],
    explanation: "",
    keywords: [] as KeywordRequest[],
  });
  const [newKeywordName, setNewKeywordName] = useState("");
  const [newKeywordIsPrivate, setNewKeywordIsPrivate] = useState(true); // Default to true for regular users

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
  });

  const [validationError, setValidationError] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: (data: any) => itemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      navigate("/my-items");
    },
    onError: (error: any) => {
      console.error("Failed to create item:", error);
      // Log the full error for debugging
      if (error?.response?.data) {
        console.error("API Error Details:", error.response.data);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    // Validate that at least one incorrect answer is provided
    const filteredIncorrectAnswers = formData.incorrectAnswers.filter(
      (ans) => ans.trim() !== ""
    );
    if (filteredIncorrectAnswers.length === 0) {
      setValidationError("Please provide at least one incorrect answer");
      return;
    }

    const data = {
      ...formData,
      incorrectAnswers: filteredIncorrectAnswers,
      keywords: formData.keywords.length > 0 ? formData.keywords : undefined,
    };

    createMutation.mutate(data);
  };

  const addKeyword = () => {
    const trimmedName = newKeywordName.trim().toLowerCase();
    if (trimmedName.length === 0 || trimmedName.length > 10) {
      return;
    }
    if (formData.keywords.some((k) => k.name.toLowerCase() === trimmedName && k.isPrivate === newKeywordIsPrivate)) {
      return; // Already exists
    }
    setFormData({
      ...formData,
      keywords: [...formData.keywords, { name: trimmedName, isPrivate: newKeywordIsPrivate }],
    });
    setNewKeywordName("");
    setNewKeywordIsPrivate(false);
  };

  const removeKeyword = (index: number) => {
    setFormData({
      ...formData,
      keywords: formData.keywords.filter((_, i) => i !== index),
    });
  };

  const handleIncorrectAnswerChange = (index: number, value: string) => {
    const newAnswers = [...formData.incorrectAnswers];
    newAnswers[index] = value;
    setFormData({ ...formData, incorrectAnswers: newAnswers });
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Create New Item
        </h1>

        {validationError && (
          <div className="mb-4">
            <ErrorMessage
              message={validationError}
              onRetry={() => setValidationError("")}
            />
          </div>
        )}

        {createMutation.isError && (
          <div className="mb-4">
            <ErrorMessage
              message={
                createMutation.error &&
                (createMutation.error as any).response?.data
                  ? Array.isArray((createMutation.error as any).response.data)
                    ? (createMutation.error as any).response.data
                        .map(
                          (err: any) =>
                            err.errorMessage ||
                            err.message ||
                            JSON.stringify(err)
                        )
                        .join(", ")
                    : typeof (createMutation.error as any).response.data ===
                      "string"
                    ? (createMutation.error as any).response.data
                    : (createMutation.error as any).response.data.title ||
                      (createMutation.error as any).response.data.detail ||
                      "Failed to create item"
                  : createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Failed to create item. Please check the browser console for details."
              }
              onRetry={() => createMutation.reset()}
            />
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow rounded-lg p-6 space-y-6"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select a category</option>
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
                checked={formData.isPrivate}
                onChange={(e) =>
                  setFormData({ ...formData, isPrivate: e.target.checked })
                }
                disabled={!isAdmin}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Private Item {!isAdmin && "(default for regular users)"}
              </span>
            </label>
            <p className="mt-1 ml-6 text-sm text-gray-500">
              Private items are visible only to your account. {!isAdmin && "Only admins can create public items."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Question *
            </label>
            <textarea
              value={formData.question}
              onChange={(e) =>
                setFormData({ ...formData, question: e.target.value })
              }
              required
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Correct Answer *
            </label>
            <input
              type="text"
              value={formData.correctAnswer}
              onChange={(e) =>
                setFormData({ ...formData, correctAnswer: e.target.value })
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Incorrect Answers (at least 1 required) *
            </label>
            {formData.incorrectAnswers.map((answer, index) => (
              <input
                key={index}
                type="text"
                value={answer}
                onChange={(e) =>
                  handleIncorrectAnswerChange(index, e.target.value)
                }
                placeholder={`Incorrect answer ${index + 1}`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
              />
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Explanation
            </label>
            <textarea
              value={formData.explanation}
              onChange={(e) =>
                setFormData({ ...formData, explanation: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Keywords (optional, max 10 characters each)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newKeywordName}
                onChange={(e) => {
                  const value = e.target.value.slice(0, 10);
                  setNewKeywordName(value);
                }}
                placeholder="Keyword name (max 10 chars)"
                maxLength={10}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <label className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm">
                <input
                  type="checkbox"
                  checked={newKeywordIsPrivate}
                  onChange={(e) => setNewKeywordIsPrivate(e.target.checked)}
                  disabled={!isAdmin}
                  className="mr-2"
                />
                Private {!isAdmin && "(default)"}
              </label>
              <button
                type="button"
                onClick={addKeyword}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                Add
              </button>
            </div>
            {formData.keywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                  >
                    {keyword.name}
                    {keyword.isPrivate && <span className="ml-1 text-xs">🔒</span>}
                    <button
                      type="button"
                      onClick={() => removeKeyword(index)}
                      className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200"
                      aria-label={`Remove ${keyword.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
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
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateItemPage;
