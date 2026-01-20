import { useNavigate } from "react-router-dom";
import type { ItemResponse } from "@/types/api";
import {
  EyeIcon,
  FolderIcon,
  PencilIcon,
  TrashIcon,
  AcademicCapIcon,
} from "@heroicons/react/24/outline";

interface MyItemsActionsProps {
  item: ItemResponse;
  canEditDelete: boolean;
  onDelete: (itemId: string) => void;
  onManageCollections: (itemId: string) => void;
  isDeleting?: boolean;
  returnUrl?: string;
}

export const MyItemsActions = ({
  item,
  canEditDelete,
  onDelete,
  onManageCollections,
  isDeleting = false,
  returnUrl,
}: MyItemsActionsProps) => {
  const navigate = useNavigate();

  const handleDelete = () => {
    if (
      window.confirm("Are you sure you want to delete this item?")
    ) {
      onDelete(item.id);
    }
  };

  const handleViewItem = () => {
    const url = returnUrl
      ? `/explore/item/${item.id}?return=${encodeURIComponent(returnUrl)}`
      : `/explore/item/${item.id}`;
    navigate(url);
  };

  return (
    <>
      <button
        onClick={handleViewItem}
        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
        title="View item"
      >
        <EyeIcon className="h-5 w-5" />
      </button>
      <button
        onClick={() => navigate(`/quiz/item/${item.id}`)}
        className="p-2 text-purple-600 hover:bg-purple-50 rounded-md"
        title="Quiz mode"
      >
        <AcademicCapIcon className="h-5 w-5" />
      </button>
      <button
        onClick={() => onManageCollections(item.id)}
        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
        title="Manage collections"
      >
        <FolderIcon className="h-5 w-5" />
      </button>
      <button
        onClick={() => navigate(`/items/${item.id}/edit`)}
        disabled={!canEditDelete}
        className={`p-2 rounded-md ${
          canEditDelete
            ? "text-indigo-600 hover:bg-indigo-50"
            : "text-gray-400 cursor-not-allowed"
        }`}
        title={
          !canEditDelete
            ? "Only admins can edit public items"
            : "Update item"
        }
      >
        <PencilIcon className="h-5 w-5" />
      </button>
      <button
        onClick={handleDelete}
        disabled={!canEditDelete || isDeleting}
        className={`p-2 rounded-md ${
          canEditDelete
            ? "text-red-600 hover:bg-red-50"
            : "text-gray-400 cursor-not-allowed"
        }`}
        title={
          !canEditDelete
            ? "Only admins can delete public items"
            : "Delete item"
        }
      >
        <TrashIcon className="h-5 w-5" />
      </button>
    </>
  );
};
