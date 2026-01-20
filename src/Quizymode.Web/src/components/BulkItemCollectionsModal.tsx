import { useQueryClient } from "@tanstack/react-query";
import ItemCollectionsModal from "@/components/ItemCollectionsModal";

interface BulkItemCollectionsModalProps {
  itemIds: string[];
  onCloseComplete: () => void;
}

const BulkItemCollectionsModal = ({
  itemIds,
  onCloseComplete,
}: BulkItemCollectionsModalProps) => {
  const queryClient = useQueryClient();

  if (itemIds.length === 0) {
    return null;
  }

  return (
    <ItemCollectionsModal
      isOpen={itemIds.length > 0}
      onClose={() => {
        itemIds.forEach((itemId) => {
          queryClient.refetchQueries({ queryKey: ["itemCollections", itemId] });
        });
        onCloseComplete();
      }}
      itemIds={itemIds}
    />
  );
};

export default BulkItemCollectionsModal;
