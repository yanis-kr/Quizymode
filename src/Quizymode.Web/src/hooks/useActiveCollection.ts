import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import type { CollectionResponse } from "@/types/api";

const SETTING_KEY_ACTIVE_COLLECTION = "ActiveCollectionId";

/**
 * Hook to get and set the user's active collection (persisted in user settings).
 * - When no collections exist, active is null.
 * - When collections exist, active is the last selected (from settings), or null if not set/invalid.
 */
export const useActiveCollection = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: ["userSettings"],
    queryFn: () => usersApi.getSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: collectionsData } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const rawActiveId = settingsData?.settings[SETTING_KEY_ACTIVE_COLLECTION];
  const collections = collectionsData?.collections ?? [];
  const collectionIds = new Set(collections.map((c) => c.id));

  // Active is only valid if it exists in current collections
  const activeCollectionId =
    isAuthenticated &&
    rawActiveId &&
    collectionIds.has(rawActiveId)
      ? rawActiveId
      : null;

  const activeCollection: CollectionResponse | null =
    activeCollectionId != null
      ? collections.find((c) => c.id === activeCollectionId) ?? null
      : null;

  const updateActiveMutation = useMutation({
    mutationFn: (collectionId: string | null) =>
      usersApi.updateSetting({
        key: SETTING_KEY_ACTIVE_COLLECTION,
        value: collectionId ?? "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userSettings"] });
    },
  });

  const setActiveCollectionId = (id: string | null) => {
    if (isAuthenticated) {
      updateActiveMutation.mutate(id);
    }
  };

  return {
    activeCollectionId,
    activeCollection,
    setActiveCollectionId,
    isUpdating: updateActiveMutation.isPending,
    collections,
  };
};
