import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { itemsApi } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import { ItemForm, type ItemFormValues } from "@/components/items/ItemForm";
import type { CreateItemRequest } from "@/types/api";
import { validateNavigationKeywordName } from "@/utils/navigationKeywordRules";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";
import { parseKeywordsParam } from "@/utils/addItemsScopeUrl";

interface ApiValidationError {
  errorMessage?: string;
  message?: string;
}

interface ApiProblemDetails {
  title?: string;
  detail?: string;
}

type CreateItemErrorResponse = ApiValidationError[] | string | ApiProblemDetails;

function buildInitialFormData(
  category: string,
  rank1: string,
  rank2: string,
  extraKeywords: string[]
): ItemFormValues {
  return {
    category,
    isPrivate: true,
    navigationRank1: rank1,
    navigationRank2: rank2,
    question: "",
    correctAnswer: "",
    incorrectAnswers: ["", "", ""],
    explanation: "",
    keywords: extraKeywords.map((name) => ({ name, isPrivate: true })),
    source: "",
    factualRisk: "",
    reviewComments: "",
    readyForReview: false,
  };
}

function getSubmitErrorMessage(error: unknown): string {
  if (!isAxiosError<CreateItemErrorResponse>(error)) {
    return error instanceof Error ? error.message : "Failed to create item.";
  }

  const data = error.response?.data;
  if (!data) return error.message ?? "Failed to create item.";
  if (Array.isArray(data)) {
    return data
      .map((entry) => entry.errorMessage ?? entry.message ?? JSON.stringify(entry))
      .join(", ");
  }
  if (typeof data === "string") return data;
  return data.title ?? data.detail ?? error.message ?? "Failed to create item.";
}

function CreateItemEditor({
  initialValues,
  isAdmin,
  isAuthenticated,
}: {
  initialValues: ItemFormValues;
  isAdmin: boolean;
  isAuthenticated: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(initialValues);
  const [validationError, setValidationError] = useState("");

  const { data: taxonomyData, isLoading: isTaxonomyLoading } = useQuery({
    queryKey: ["taxonomy"],
    queryFn: () => taxonomyApi.getAll(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const categoriesForForm = useMemo(
    () => (taxonomyData?.categories ?? []).map((category) => ({ category: category.slug })),
    [taxonomyData]
  );

  const selectedCategory = useMemo(
    () => taxonomyData?.categories.find((category) => category.slug === formData.category),
    [taxonomyData, formData.category]
  );

  const rank1Options = useMemo(
    () => selectedCategory?.groups.map((group) => group.slug) ?? [],
    [selectedCategory]
  );

  const rank2Options = useMemo(() => {
    const group = selectedCategory?.groups.find(
      (candidate) => candidate.slug === formData.navigationRank1
    );
    return group?.keywords.map((keyword) => keyword.slug) ?? [];
  }, [selectedCategory, formData.navigationRank1]);

  const taxonomyExtraSlugs = useMemo(() => {
    const rank1 = formData.navigationRank1.trim().toLowerCase();
    const rank2 = formData.navigationRank2.trim().toLowerCase();
    return (selectedCategory?.allKeywordSlugs ?? []).filter(
      (slug) => slug.toLowerCase() !== rank1 && slug.toLowerCase() !== rank2
    );
  }, [selectedCategory, formData.navigationRank1, formData.navigationRank2]);

  const { extraKeywordAutocompleteSource, itemTagKeywordsLoading } =
    useExtraKeywordAutocompleteSource(formData.category, taxonomyExtraSlugs, isAuthenticated);

  const createMutation = useMutation({
    mutationFn: (data: CreateItemRequest) => itemsApi.create(data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      const category = variables.category.trim();
      if (category) {
        queryClient.invalidateQueries({ queryKey: ["itemTagKeywords", category] });
      }
      const createdItemId = typeof data?.id === "string" ? data.id : "";
      navigate(createdItemId ? `/items/${createdItemId}` : "/categories");
    },
    onError: (error: unknown) => {
      console.error("Failed to create item:", error);
      if (isAxiosError<CreateItemErrorResponse>(error) && error.response?.data) {
        console.error("API Error Details:", error.response.data);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    const filteredIncorrectAnswers = formData.incorrectAnswers.filter(
      (answer) => answer.trim() !== ""
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

    const rank1 = formData.navigationRank1.trim().toLowerCase();
    const rank2 = formData.navigationRank2.trim().toLowerCase();
    const otherKeywords = formData.keywords
      .filter((keyword) => {
        const name = keyword.name.toLowerCase();
        return name !== rank1 && name !== rank2;
      })
      .map((keyword) => ({ ...keyword, isPrivate: true }));

    const factualRiskNum =
      formData.factualRisk.trim() !== ""
        ? parseFloat(formData.factualRisk.trim())
        : undefined;

    const data: CreateItemRequest = {
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

  return (
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
      isAdmin={isAdmin}
      isPending={createMutation.isPending}
      validationError={validationError}
      submitError={createMutation.isError ? getSubmitErrorMessage(createMutation.error) : undefined}
      onDismissSubmitError={() => createMutation.reset()}
      extraKeywordAutocompleteSource={extraKeywordAutocompleteSource}
      extraKeywordAutocompleteLoading={itemTagKeywordsLoading}
    />
  );
}

const CreateItemPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get("category") || "";
  const keywordsParam = searchParams.get("keywords");
  const { rank1: rank1FromUrl, rank2: rank2FromUrl, extrasJoined } = useMemo(
    () => parseKeywordsParam(keywordsParam),
    [keywordsParam]
  );
  const extraKeywordsFromUrl = useMemo(
    () =>
      extrasJoined
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    [extrasJoined]
  );

  const initialFormData = useMemo(
    () =>
      buildInitialFormData(
        categoryFromUrl,
        rank1FromUrl,
        rank2FromUrl,
        extraKeywordsFromUrl
      ),
    [categoryFromUrl, rank1FromUrl, rank2FromUrl, extraKeywordsFromUrl]
  );

  const scopeKey = useMemo(
    () => [categoryFromUrl, rank1FromUrl, rank2FromUrl, extraKeywordsFromUrl.join(",")].join("|"),
    [categoryFromUrl, rank1FromUrl, rank2FromUrl, extraKeywordsFromUrl]
  );

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
          Create a new quiz item with a question, correct answer, incorrect answer options, and
          optional explanation. Regular users can create private items; admins can create public
          items visible to everyone.
        </p>

        <CreateItemEditor
          key={scopeKey}
          initialValues={initialFormData}
          isAdmin={!!isAdmin}
          isAuthenticated={isAuthenticated}
        />
      </div>
    </div>
  );
};

export default CreateItemPage;
