import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { ItemForm } from "@/components/items/ItemForm";
import type { KeywordRequest } from "@/types/api";
import { validateNavigationKeywordName } from "@/utils/navigationKeywordRules";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";

const EditItemPage = () => {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const {
    data: itemData,
    isLoading: isLoadingItem,
    error: itemError,
  } = useQuery({
    queryKey: ["item", id],
    queryFn: () => itemsApi.getById(id!),
    enabled: !!id && isAuthenticated,
  });

  const [validationError, setValidationError] = useState<string>("");

  useEffect(() => {
    if (itemData) {
      const breadcrumb = itemData.navigationBreadcrumb ?? [];
      setFormData({
        category: itemData.category || "",
        isPrivate: itemData.isPrivate || false,
        navigationRank1: breadcrumb[0] ?? "",
        navigationRank2: breadcrumb[1] ?? "",
        question: itemData.question || "",
        correctAnswer: itemData.correctAnswer || "",
        incorrectAnswers:
          itemData.incorrectAnswers && itemData.incorrectAnswers.length > 0
            ? [...itemData.incorrectAnswers, "", "", ""].slice(0, 3)
            : ["", "", ""],
        explanation: itemData.explanation || "",
        keywords: itemData.keywords
          ? itemData.keywords
              .filter(
                (k) =>
                  breadcrumb[0]?.toLowerCase() !== k.name.toLowerCase() &&
                  breadcrumb[1]?.toLowerCase() !== k.name.toLowerCase()
              )
              .map((k) => ({ name: k.name, isPrivate: k.isPrivate }))
          : [],
        source: itemData.source || "",
        factualRisk:
          itemData.factualRisk != null ? String(itemData.factualRisk) : "",
        reviewComments: itemData.reviewComments || "",
        readyForReview: false,
      });
    }
  }, [itemData]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => itemsApi.update(id!, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["item", id] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      const cat =
        typeof variables?.category === "string" ? variables.category.trim() : "";
      if (cat) {
        queryClient.invalidateQueries({ queryKey: ["itemTagKeywords", cat] });
      }
      navigate("/categories");
    },
    onError: (error: any) => {
      console.error("Failed to update item:", error);
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
    const otherKeywords = formData.keywords.filter(
      (k) => k.name.toLowerCase() !== r1 && k.name.toLowerCase() !== r2
    );

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
      keywords: otherKeywords,
      source: formData.source.trim() || undefined,
      factualRisk:
        factualRiskNum !== undefined && factualRiskNum >= 0 && factualRiskNum <= 1
          ? factualRiskNum
          : undefined,
      reviewComments: formData.reviewComments.trim() || undefined,
      readyForReview: formData.readyForReview,
    };

    updateMutation.mutate(data);
  };

  const getSubmitError = () => {
    const err = updateMutation.error as any;
    if (!err?.response?.data) return err?.message ?? "Failed to update item.";
    const data = err.response.data;
    if (Array.isArray(data))
      return data.map((e: any) => e.errorMessage ?? e.message ?? JSON.stringify(e)).join(", ");
    if (typeof data === "string") return data;
    return data.title ?? data.detail ?? "Failed to update item.";
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoadingItem) {
    return <LoadingSpinner />;
  }

  if (itemError || !itemData) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <ErrorMessage
          message="Failed to load item. It may not exist or you may not have permission to edit it."
          onRetry={() => navigate("/categories")}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Item</h1>
        <p className="text-gray-600 text-sm mb-6">
          Update the quiz item details. Regular users can edit their own private items; admins can edit any item including public ones.
        </p>

        <ItemForm
          mode="edit"
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
          isPending={updateMutation.isPending}
          validationError={validationError}
          submitError={updateMutation.isError ? getSubmitError() : undefined}
          onDismissSubmitError={() => updateMutation.reset()}
          extraKeywordAutocompleteSource={extraKeywordAutocompleteSource}
          extraKeywordAutocompleteLoading={itemTagKeywordsLoading}
          taxonomyPublicSlugs={selectedCategory?.allKeywordSlugs ?? []}
        />
      </div>
    </div>
  );
};

export default EditItemPage;
