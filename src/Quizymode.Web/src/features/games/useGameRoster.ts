import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { collectionsApi } from "@/api/collections";
import { categoriesApi } from "@/api/categories";
import { useAuth } from "@/contexts/AuthContext";
import type { ViewMode } from "@/components/ModeSwitcher";
import { buildCategoryPath, categoryNameToSlug, findCategoryNameFromSlug } from "@/utils/categorySlug";
import { buildCollectionPath, buildCollectionStudyPath } from "@/utils/collectionPath";
import { getCategoryScopeModeConfig } from "@/features/categories/utils/categoryScopeMode";
import { getStudyScopeKeywords } from "@/features/items/utils/studyScopeParams";
import type { ItemResponse } from "@/types/api";
import { GAME_FETCH_SIZE, buildGamePool } from "./gameRoster";
import { buildGamePath, type GameScope } from "./gameScope";

const EMPTY_ITEMS: ItemResponse[] = [];

/**
 * Loads the short-item roster for the scope in the URL (AC 3.20.2) and the mode navigation shared by the Games pages.
 * Scope loading mirrors Learn's (collection: every item; category, keywords, global: a random 200).
 */
export function useGameRoster() {
  const { category: categorySlug, collectionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hasCategoryScope = !!categorySlug && !collectionId;
  const { navigationKeywords, filterKeywords } = useMemo(
    () => getStudyScopeKeywords(searchParams, hasCategoryScope),
    [searchParams, hasCategoryScope],
  );
  const { isAuthenticated, isLoading: isAuthLoading, userId } = useAuth();
  const identityKey = isAuthenticated ? `user:${userId ?? "unknown"}` : "guest";
  const authSettled = !isAuthLoading;

  const { data: categoriesData, error: categoriesError } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: hasCategoryScope,
  });
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const category = useMemo(() => {
    if (!categorySlug || collectionId) return undefined;
    if (!categoriesData?.categories) return categorySlug;
    const names = categoriesData.categories.map((c) => c.category);
    return findCategoryNameFromSlug(categorySlug, names) || categorySlug;
  }, [categorySlug, collectionId, categoriesData?.categories]);
  const categoryReady = !hasCategoryScope || !!categoriesData?.categories || !!categoriesError;

  const { data: collectionInfo } = useQuery({
    queryKey: ["collection", collectionId, identityKey],
    queryFn: () => collectionsApi.getById(collectionId!),
    enabled: !!collectionId,
  });

  const {
    data: rosterItems,
    error,
    isPending,
    refetch,
  } = useQuery<ItemResponse[]>({
    queryKey: ["gameRoster", identityKey, collectionId ?? null, category ?? null, navigationKeywords, filterKeywords],
    queryFn: async () => {
      if (collectionId) {
        const response = await collectionsApi.getItems(collectionId);
        return response.items;
      }
      const response = await itemsApi.getRandom(
        category,
        GAME_FETCH_SIZE,
        filterKeywords.length > 0 ? filterKeywords : undefined,
        { navigationKeywords: hasCategoryScope && navigationKeywords.length > 0 ? navigationKeywords : undefined },
      );
      return response.items;
    },
    enabled: authSettled && categoryReady,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const pool = useMemo<ItemResponse[]>(() => buildGamePool(rosterItems ?? []), [rosterItems]);

  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const scope = useMemo<GameScope>(() => {
    if (collectionId) return { kind: "collection", collectionId, collectionName: collectionInfo?.name, search };
    if (category) return { kind: "category", category, navigationKeywords, filterKeywords, search };
    return { kind: "global", filterKeywords, search };
  }, [collectionId, collectionInfo?.name, category, navigationKeywords, filterKeywords, search]);

  const hideSetsMode = !!category && navigationKeywords.length >= 2;
  const availableModes: ViewMode[] = collectionId
    ? ["list", "explore", "quiz", "learn", "games"]
    : getCategoryScopeModeConfig("sets", hideSetsMode).availableModes;
  const categoryScopePath = category
    ? buildCategoryPath(categoryNameToSlug(category), navigationKeywords)
    : "/categories";
  const collectionListPath = collectionId ? buildCollectionPath(collectionId, collectionInfo?.name) : null;

  const studyPath = (mode: "explore" | "quiz" | "learn"): string => {
    if (collectionId) return `${buildCollectionStudyPath(mode, collectionId, collectionInfo?.name)}${search}`;
    if (category) return `/${mode}/${categoryNameToSlug(category)}${search}`;
    return `/${mode}${search}`;
  };
  const quizPath = studyPath("quiz");

  const handleModeChange = (mode: ViewMode) => {
    if (mode === "sets") navigate(categoryScopePath);
    else if (mode === "list") {
      if (collectionListPath) navigate(collectionListPath);
      else if (category) navigate(`${categoryScopePath}?view=items`);
      else navigate("/categories");
    } else if (mode === "explore" || mode === "quiz" || mode === "learn") navigate(studyPath(mode));
    else navigate(buildGamePath(scope));
  };

  const title = collectionId ? (collectionInfo?.name ?? "Collection") : (category ?? "All categories");

  return {
    scope,
    title,
    pool,
    /** The roster before the short-text game pool rules; Sort It builds its own pool from it. */
    rawItems: rosterItems ?? EMPTY_ITEMS,
    isPending: isPending || !authSettled,
    error: error && !rosterItems ? error : null,
    refetch: () => void refetch(),
    availableModes,
    handleModeChange,
    quizPath,
  };
}
