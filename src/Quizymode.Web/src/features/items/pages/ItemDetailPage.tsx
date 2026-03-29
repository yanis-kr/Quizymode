import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import ItemRatingsComments from "@/components/ItemRatingsComments";
import { buildCategoryPath, categoryNameToSlug } from "@/utils/categorySlug";

const ItemDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, userId, isAdmin } = useAuth();
  const returnUrl = searchParams.get("return");
  const returnMode = searchParams.get("returnMode");
  const safeReturnUrl =
    returnUrl && returnUrl.startsWith("/") ? returnUrl : null;
  const inferredReturnMode =
    returnMode ??
    (safeReturnUrl?.startsWith("/quiz") ? "quiz" : undefined) ??
    (safeReturnUrl?.startsWith("/explore") ? "explore" : undefined);
  const returnLabel =
    inferredReturnMode === "quiz"
      ? "Back to Quiz"
      : inferredReturnMode === "explore"
        ? "Back to Explore"
        : "Back";

  const {
    data: item,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["item", id],
    queryFn: () => itemsApi.getById(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => itemsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["item", id] });
      navigate("/categories");
    },
  });

  const canEdit =
    isAuthenticated &&
    item &&
    (item.createdBy === userId || isAdmin);

  if (isLoading) return <LoadingSpinner />;
  if (error || !item) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <ErrorMessage
          message="Failed to load item. It may not exist or you may not have access."
          onRetry={() => refetch()}
        />
        {safeReturnUrl ? (
          <button
            type="button"
            onClick={() => navigate(safeReturnUrl)}
            className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            {returnLabel}
          </button>
        ) : (
          <Link
            to="/categories"
            className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back to Categories
          </Link>
        )}
      </div>
    );
  }

  const createdDate = item.createdAt
    ? new Date(item.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const navBreadcrumb = item.navigationBreadcrumb && item.navigationBreadcrumb.length > 0 && item.category;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          {safeReturnUrl ? (
            <button
              type="button"
              onClick={() => navigate(safeReturnUrl)}
              className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-indigo-600"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              {returnLabel}
            </button>
          ) : navBreadcrumb ? (
            <nav className="flex items-center gap-1 text-sm text-gray-600 flex-wrap">
              <Link to="/categories" className="text-indigo-600 hover:text-indigo-800">
                Categories
              </Link>
              <Link
                to={buildCategoryPath(categoryNameToSlug(item.category), [])}
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
              >
                <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                {item.category}
              </Link>
              {item.navigationBreadcrumb!.map((kw, i) => (
                <Link
                  key={i}
                  to={buildCategoryPath(
                    categoryNameToSlug(item.category),
                    item.navigationBreadcrumb!.slice(0, i + 1)
                  )}
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                >
                  <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  {kw.toLowerCase() === "other" ? "Others" : kw}
                </Link>
              ))}
            </nav>
          ) : (
            <Link
              to="/categories"
              className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-indigo-600"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back to Categories
            </Link>
          )}
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link
                to={`/items/${item.id}/edit`}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <PencilSquareIcon className="h-4 w-4 mr-1.5" />
                Edit
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this item? This cannot be undone.")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4 mr-1.5" />
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4 text-gray-500">
            <EyeIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Item details</span>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Question</h2>
              <p className="text-gray-900">{item.question}</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Answer</h2>
              <p className="text-gray-900 font-medium">{item.correctAnswer}</p>
            </div>

            {item.incorrectAnswers && item.incorrectAnswers.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-1">Incorrect options</h2>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  {item.incorrectAnswers.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {item.explanation && (
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-1">Explanation</h2>
                <p className="text-gray-700">{item.explanation}</p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Category</span>
                  <p className="font-medium text-gray-900">{item.category ?? "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">Visibility</span>
                  <p className="font-medium text-gray-900">{item.isPrivate ? "Private" : "Public"}</p>
                </div>
                {createdDate && (
                  <div>
                    <span className="text-gray-500">Created</span>
                    <p className="font-medium text-gray-900">{createdDate}</p>
                  </div>
                )}
                {item.createdBy && (
                  <div>
                    <span className="text-gray-500">Created by</span>
                    <p className="font-medium text-gray-900 truncate" title={item.createdBy}>
                      {item.createdBy}
                    </p>
                  </div>
                )}
                {item.source && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-500">Source</span>
                    <p className="font-medium text-gray-900">{item.source}</p>
                  </div>
                )}
                {item.factualRisk != null && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-500">Factual risk</span>
                    <p className="font-medium text-gray-900">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.factualRisk >= 0.7
                            ? "bg-amber-100 text-amber-800"
                            : item.factualRisk >= 0.4
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {(item.factualRisk * 100).toFixed(0)}%
                      </span>
                    </p>
                  </div>
                )}
                {item.reviewComments && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-500">Review comments</span>
                    <p className="font-medium text-gray-900">{item.reviewComments}</p>
                  </div>
                )}
              </div>
            </div>

            {item.keywords && item.keywords.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-2">Keywords</h2>
                <div className="flex flex-wrap gap-2">
                  {item.keywords.map((k) => (
                    <span
                      key={k.id}
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        k.isPrivate
                          ? "bg-purple-100 text-purple-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {k.name}
                      {k.isPrivate && <span className="ml-1">🔒</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {item.collections && item.collections.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-2">Collections</h2>
                <div className="flex flex-wrap gap-2">
                  {item.collections.map((c) => (
                    <Link
                      key={c.id}
                      to={`/collections?selected=${c.id}`}
                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {isAuthenticated && (
              <div className="border-t border-gray-200 pt-4">
                <ItemRatingsComments
                  itemId={item.id}
                  returnUrl={window.location.pathname}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemDetailPage;
