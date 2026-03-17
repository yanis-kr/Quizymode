import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { ItemForm } from "@/components/items/ItemForm";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
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
    navigationRank1: "",
    navigationRank2: "",
    question: "",
    correctAnswer: "",
    incorrectAnswers: ["", "", ""],
    explanation: "",
    keywords: [] as KeywordRequest[],
    source: "",
    factualRisk: "",
    reviewComments: "",
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
  });
  const { data: rank1Data, isLoading: isLoadingRank1 } = useQuery({
    queryKey: ["keywords", "rank1", formData.category],
    queryFn: () => keywordsApi.getNavigationKeywords(formData.category, []),
    enabled: !!formData.category.trim(),
  });
  const { data: rank2Data, isLoading: isLoadingRank2 } = useQuery({
    queryKey: ["keywords", "rank2", formData.category, formData.navigationRank1],
    queryFn: () =>
      keywordsApi.getNavigationKeywords(formData.category, [formData.navigationRank1]),
    enabled: !!formData.category.trim() && !!formData.navigationRank1.trim(),
  });
  const rank1Options = (rank1Data?.keywords ?? [])
    .filter((k) => k.name.toLowerCase() !== "other")
    .map((k) => k.name);
  const rank2Options = (rank2Data?.keywords ?? []).map((k) => k.name);

  const [validationError, setValidationError] = useState<string>("");

  useEffect(() => {
    if (categoryFromUrl) {
      setFormData((prev) => ({ ...prev, category: categoryFromUrl }));
    }
    if (keywordsFromUrl.length > 0) {
      setFormData((prev) => ({
        ...prev,
        navigationRank1: keywordsFromUrl[0] ?? "",
        navigationRank2: keywordsFromUrl[1] ?? "",
        keywords: keywordsFromUrl
          .slice(2)
          .map((name) => ({ name, isPrivate: true })),
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

    const r1 = formData.navigationRank1.trim().toLowerCase();
    const r2 = formData.navigationRank2.trim().toLowerCase();
    const navKeywords: KeywordRequest[] = [];
    if (r1) {
      navKeywords.push({
        name: formData.navigationRank1.trim(),
        isPrivate: !rank1Options.some((o) => o.toLowerCase() === r1),
      });
    }
    if (r2) {
      navKeywords.push({
        name: formData.navigationRank2.trim(),
        isPrivate: !rank2Options.some((o) => o.toLowerCase() === r2),
      });
    }
    const otherKeywords = formData.keywords.filter(
      (k) => k.name.toLowerCase() !== r1 && k.name.toLowerCase() !== r2
    );
    const allKeywords = [...navKeywords, ...otherKeywords];

    const factualRiskNum =
      formData.factualRisk.trim() !== ""
        ? parseFloat(formData.factualRisk.trim())
        : undefined;
    const data = {
      category: formData.category.trim(),
      isPrivate: formData.isPrivate,
      question: formData.question.trim(),
      correctAnswer: formData.correctAnswer.trim(),
      incorrectAnswers: filteredIncorrectAnswers,
      explanation: formData.explanation.trim(),
      keywords: allKeywords.length > 0 ? allKeywords : undefined,
      source: formData.source.trim() || undefined,
      factualRisk:
        factualRiskNum !== undefined && factualRiskNum >= 0 && factualRiskNum <= 1
          ? factualRiskNum
          : undefined,
      reviewComments: formData.reviewComments.trim() || undefined,
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
          rank1Options={rank1Options}
          rank2Options={rank2Options}
          isLoadingRank1={isLoadingRank1}
          isLoadingRank2={isLoadingRank2}
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
