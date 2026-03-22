import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { ItemForm } from "@/components/items/ItemForm";
import type { KeywordRequest } from "@/types/api";
import { validateNavigationKeywordName } from "@/utils/navigationKeywordRules";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";

const CreateItemPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const categoryFromUrl = searchParams.get("category") || "";
  const keywordsFromUrl = searchParams.get("keywords")?.split(",").filter(Boolean) || [];
  const [formData, setFormData] = useState({
    category: "",
    isPrivate: true,
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
    readyForReview: false,
  });

  const { data: taxonomyData, isLoading: isTaxonomyLoading } = useQuery({
    queryKey: ["taxonomy"],
    queryFn: () => taxonomyApi.getAll(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const categoriesForForm = useMemo(
    () => (taxonomyData?.categories ?? []).map((c) => ({ category: c.slug })),
    [taxonomyData]
  );

  const selectedCategory = useMemo(
    () => taxonomyData?.categories.find((c) => c.slug === formData.category),
    [taxonomyData, formData.category]
  );

  const rank1Options = useMemo(
    () => selectedCategory?.groups.map((g) => g.slug) ?? [],
    [selectedCategory]
  );

  const rank2Options = useMemo(() => {
    const g = selectedCategory?.groups.find(
      (x) => x.slug === formData.navigationRank1
    );
    return g?.keywords.map((k) => k.slug) ?? [];
  }, [selectedCategory, formData.navigationRank1]);

  const taxonomyExtraSlugs = useMemo(() => {
    const r1 = formData.navigationRank1.trim().toLowerCase();
    const r2 = formData.navigationRank2.trim().toLowerCase();
    return (selectedCategory?.allKeywordSlugs ?? []).filter(
      (s) => s.toLowerCase() !== r1 && s.toLowerCase() !== r2
    );
  }, [selectedCategory, formData.navigationRank1, formData.navigationRank2]);

  const { extraKeywordAutocompleteSource, itemTagKeywordsLoading } =
    useExtraKeywordAutocompleteSource(formData.category, taxonomyExtraSlugs, isAuthenticated);

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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      const cat =
        typeof variables?.category === "string" ? variables.category.trim() : "";
      if (cat) {
        queryClient.invalidateQueries({ queryKey: ["itemTagKeywords", cat] });
      }
      navigate("/categories");
    },
    onError: (error: any) => {
      console.error("Failed to create item:", error);
      if (error?.response?.data) {
        console.error("API Error Details:", error.response.data);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    const filteredIncorrectAnswers = formData.incorrectAnswers.filter(
      (ans) => ans.trim() !== ""
    );
    if (filteredIncorrectAnswers.length === 0) {
      setValidationError("Please provide at least one incorrect answer");
      return;
    }

    if (!formData.navigationRank1.trim() || !formData.navigationRank2.trim()) {
      setValidationError("Primary topic (rank 1) and subtopic (rank 2) are required.");
      return;
    }
    const navFormatError =
      validateNavigationKeywordName(formData.navigationRank1) ??
      validateNavigationKeywordName(formData.navigationRank2);
    if (navFormatError) {
      setValidationError(navFormatError);
      return;
    }

    const r1 = formData.navigationRank1.trim().toLowerCase();
    const r2 = formData.navigationRank2.trim().toLowerCase();
    const otherKeywords = formData.keywords
      .filter((k) => k.name.toLowerCase() !== r1 && k.name.toLowerCase() !== r2)
      .map((k) => ({ ...k, isPrivate: true }));

    const factualRiskNum =
      formData.factualRisk.trim() !== ""
        ? parseFloat(formData.factualRisk.trim())
        : undefined;

    const data = {
      category: formData.category.trim(),
      navigationKeyword1: formData.navigationRank1.trim(),
      navigationKeyword2: formData.navigationRank2.trim(),
      isPrivate: formData.isPrivate,
      question: formData.question.trim(),
      correctAnswer: formData.correctAnswer.trim(),
      incorrectAnswers: filteredIncorrectAnswers,
      explanation: formData.explanation.trim(),
      keywords: otherKeywords.length > 0 ? otherKeywords : undefined,
      source: formData.source.trim() || undefined,
      factualRisk:
        factualRiskNum !== undefined && factualRiskNum >= 0 && factualRiskNum <= 1
          ? factualRiskNum
          : undefined,
      reviewComments: formData.reviewComments.trim() || undefined,
      readyForReview: formData.readyForReview,
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
          categories={categoriesForForm}
          rank1Options={rank1Options}
          rank2Options={rank2Options}
          isLoadingRank1={isTaxonomyLoading && !!formData.category}
          isLoadingRank2={isTaxonomyLoading && !!formData.navigationRank1}
          isAdmin={!!isAdmin}
          isPending={createMutation.isPending}
          validationError={validationError}
          submitError={createMutation.isError ? getSubmitError() : undefined}
          onDismissSubmitError={() => createMutation.reset()}
          extraKeywordAutocompleteSource={extraKeywordAutocompleteSource}
          extraKeywordAutocompleteLoading={itemTagKeywordsLoading}
        />
      </div>
    </div>
  );
};

export default CreateItemPage;
