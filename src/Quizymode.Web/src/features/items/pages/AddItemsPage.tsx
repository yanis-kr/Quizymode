import { useNavigate, useSearchParams } from "react-router-dom";
import { PlusIcon, DocumentPlusIcon } from "@heroicons/react/24/outline";
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
    return `/my-items/bulk-create${params.toString() ? `?${params.toString()}` : ""}`;
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Add Items</h1>
        <p className="text-gray-600 text-sm mb-6">
          Create a new quiz item or bulk add multiple items from a file.
        </p>
        {category && (
          <p className="text-sm text-gray-500 mb-6">
            Category: <strong>{category}</strong>
            {keywords.length > 0 && (
              <> | Keywords: <strong>{keywords.join(", ")}</strong></>
            )}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => navigate(buildCreateUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-left"
          >
            <PlusIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">Create Item</span>
              <span className="text-sm text-indigo-100">Add a single quiz item</span>
            </div>
          </button>
          <button
            onClick={() => navigate(buildBulkUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-left"
          >
            <DocumentPlusIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">Bulk Add</span>
              <span className="text-sm text-green-100">Add multiple items from JSON</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddItemsPage;
