import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { ItemForm } from "@/components/items/ItemForm";
import { categoriesApi } from "@/api/categories";
import { useQuery } from "@tanstack/react-query";
import type { KeywordRequest } from "@/types/api";

const CreateItemPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const categoryFromUrl = searchParams.get("category") || "";
  const keywordsFromUrl = searchParams.get("keywords")?.split(",").filter(Boolean) || [];
  const [formData, setFormData] = useState({
    category: "",
    isPrivate: true, // Default to true for regular users
    question: "",
    correctAnswer: "",
    incorrectAnswers: ["", "", ""],
    explanation: "",
    keywords: [] as KeywordRequest[],
    source: "",
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
  });

  const [validationError, setValidationError] = useState<string>("");

  useEffect(() => {
    if (categoryFromUrl) {
      setFormData((prev) => ({ ...prev, category: categoryFromUrl }));
    }
    if (keywordsFromUrl.length > 0) {
      setFormData((prev) => ({
        ...prev,
        keywords: keywordsFromUrl.map((name) => ({ name, isPrivate: true })),
      }));
    }
  }, [categoryFromUrl, keywordsFromUrl]);

  const createMutation = useMutation({
    mutationFn: (data: any) => itemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      navigate("/categories");
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
      source: formData.source.trim() || undefined,
    };

    createMutation.mutate(data);
  };

  const getSubmitError = () => {
    const err = createMutation.error as any;
    if (!err?.response?.data) return err?.message ?? "Failed to create item.";
    const data = err.response.data;
    if (Array.isArray(data))
      return data.map((e: any) => e.errorMessage ?? e.message ?? JSON.stringify(e)).join(", ");
    if (typeof data === "string") return data;
    return data.title ?? data.detail ?? "Failed to create item.";
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Create New Item
        </h1>
        <p className="text-gray-600 text-sm mb-6">
          Create a new quiz item with a question, correct answer, incorrect answer options, and optional explanation. Regular users can create private items; admins can create public items visible to everyone.
        </p>

        <ItemForm
          mode="create"
          values={formData}
          onChange={setFormData}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/categories")}
          categories={categoriesData?.categories ?? []}
          isAdmin={!!isAdmin}
          isPending={createMutation.isPending}
          validationError={validationError}
          submitError={createMutation.isError ? getSubmitError() : undefined}
          onDismissSubmitError={() => createMutation.reset()}
        />
      </div>
    </div>
  );
};

export default CreateItemPage;
