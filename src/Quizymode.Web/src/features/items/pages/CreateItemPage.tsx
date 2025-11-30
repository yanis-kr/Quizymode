import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import ErrorMessage from "@/components/ErrorMessage";
import { categoriesApi } from "@/api/categories";
import { useQuery } from "@tanstack/react-query";

const CreateItemPage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    category: "",
    subcategory: "",
    isPrivate: false,
    question: "",
    correctAnswer: "",
    incorrectAnswers: ["", "", ""],
    explanation: "",
  });

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

    // Validate that subcategory is provided (API requires it)
    if (!formData.subcategory.trim()) {
      setValidationError("Subcategory is required");
      return;
    }

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
      subcategory: formData.subcategory.trim(),
      incorrectAnswers: filteredIncorrectAnswers,
    };

    createMutation.mutate(data);
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subcategory *
            </label>
            <input
              type="text"
              value={formData.subcategory}
              onChange={(e) =>
                setFormData({ ...formData, subcategory: e.target.value })
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isPrivate}
                onChange={(e) =>
                  setFormData({ ...formData, isPrivate: e.target.checked })
                }
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Private Item
              </span>
            </label>
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
