import { useNavigate, useSearchParams } from "react-router-dom";
import {
  PlusIcon,
  DocumentPlusIcon,
  ArrowUpTrayIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

const AddItemsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const category = searchParams.get("category") || "";
  const keywordsParam = searchParams.get("keywords");
  const keywords = keywordsParam ? keywordsParam.split(",").filter(Boolean) : [];

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const buildCreateUrl = () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (keywords.length > 0) params.set("keywords", keywords.join(","));
    return `/items/create${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const buildBulkUrl = () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (keywords.length > 0) params.set("keywords", keywords.join(","));
    return `/items/bulk-create${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const buildUploadUrl = () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (keywords.length > 0) params.set("keywords", keywords.join(","));
    return `/items/upload${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const buildStudyGuideUrl = () => "/study-guide";

  const buildStudyGuideImportUrl = () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (keywords.length > 0) params.set("keywords", keywords.join(","));
    return `/study-guide/import${params.toString() ? `?${params.toString()}` : ""}`;
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Add Items</h1>
        <p className="text-gray-600 text-sm mb-6">
          Use your study guide or AI to create quiz items, or add them one by one.
        </p>
        {category && (
          <p className="text-sm text-gray-500 mb-6">
            Category: <strong>{category}</strong>
            {keywords.length > 0 && (
              <> | Keywords: <strong>{keywords.join(", ")}</strong></>
            )}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-4 flex-wrap mb-6">
          <button
            onClick={() => navigate(buildStudyGuideUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-left"
          >
            <BookOpenIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">My Study Guide</span>
              <span className="text-sm text-slate-200">
                Paste or edit your study guide text to reuse when generating items.
              </span>
            </div>
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
          <button
            onClick={() => navigate(buildCreateUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-left"
          >
            <PlusIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">Create a New Item</span>
              <span className="text-sm text-indigo-100">Add a single quiz item with full control.</span>
            </div>
          </button>
          <button
            onClick={() => navigate(buildStudyGuideImportUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-left"
          >
            <DocumentPlusIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">Create Items from Study Guide</span>
              <span className="text-sm text-emerald-100">
                Generate AI prompts from your study guide, paste JSON, validate, and import.
              </span>
            </div>
          </button>
          <button
            onClick={() => navigate(buildBulkUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-left"
          >
            <ArrowUpTrayIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">Bulk Create Items (no Study Guide)</span>
              <span className="text-sm text-amber-100">
                Ask AI to generate random questions for this category/keywords and paste JSON.
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddItemsPage;
