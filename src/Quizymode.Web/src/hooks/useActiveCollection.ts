import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import type { CollectionResponse } from "@/types/api";

const SETTING_KEY_ACTIVE_COLLECTION = "ActiveCollectionId";

/**
 * Hook to get and set the user's active collection (persisted in user settings).
 * User always has an active collection: at signup the backend creates "Default Collection" and sets it active.
 * When collections exist and no valid active is set, we set active to the first collection.
 */
export const useActiveCollection = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const hasSetDefaultActive = useRef(false);

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

  // When user has collections but no valid active, set active to first collection (e.g. MyCollection)
  useEffect(() => {
    if (
      !isAuthenticated ||
      collections.length === 0 ||
      activeCollectionId != null ||
      hasSetDefaultActive.current
    ) {
      return;
    }
    hasSetDefaultActive.current = true;
    updateActiveMutation.mutate(collections[0].id);
  }, [isAuthenticated, collections, activeCollectionId]);

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
