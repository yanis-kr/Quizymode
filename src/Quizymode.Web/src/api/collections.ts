import { apiClient } from "./client";
import { itemsApi } from "./items";
import type {
  CollectionsResponse,
  CollectionResponse,
  ItemResponse,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  AddItemToCollectionRequest,
  BulkAddItemsToCollectionRequest,
  BulkAddItemsToCollectionResponse,
  DiscoverCollectionsResponse,
  BookmarkItem,
  SharedWithMeItem,
} from "@/types/api";

export const collectionsApi = {
  getAll: async (): Promise<CollectionsResponse> => {
    const response = await apiClient.get<CollectionsResponse>("/collections");
    return response.data;
  },

  getById: async (id: string): Promise<CollectionResponse> => {
    const response = await apiClient.get<CollectionResponse>(
      `/collections/${id}`
    );
    return response.data;
  },

  getItems: async (
    collectionId: string
  ): Promise<{ items: ItemResponse[] }> => {
    // Use GET /items?collectionId=X instead of GET /collections/{id}/items
    const response = await itemsApi.getAll(undefined, undefined, undefined, collectionId, undefined, 1, 1000);
    return { items: response.items };
  },

  create: async (
    data: CreateCollectionRequest
  ): Promise<CollectionResponse> => {
    const response = await apiClient.post<CollectionResponse>(
      "/collections",
      data
    );
    return response.data;
  },

  update: async (
    id: string,
    data: UpdateCollectionRequest
  ): Promise<CollectionResponse> => {
    const response = await apiClient.put<CollectionResponse>(
      `/collections/${id}`,
      data
    );
    return response.data;
  },

  discover: async (
    q?: string,
    page?: number,
    pageSize?: number
  ): Promise<DiscoverCollectionsResponse> => {
    const params = new URLSearchParams();
    if (q != null && q !== "") params.set("q", q);
    if (page != null) params.set("page", String(page));
    if (pageSize != null) params.set("pageSize", String(pageSize));
    const response = await apiClient.get<DiscoverCollectionsResponse>(
      `/collections/discover?${params.toString()}`
    );
    return response.data;
  },

  getBookmarks: async (): Promise<{ collections: BookmarkItem[] }> => {
    const response = await apiClient.get<{ collections: BookmarkItem[] }>(
      "/collections/bookmarks"
    );
    return response.data;
  },

  getSharedWithMe: async (): Promise<{
    collections: SharedWithMeItem[];
  }> => {
    const response = await apiClient.get<{ collections: SharedWithMeItem[] }>(
      "/collections/shared-with-me"
    );
    return response.data;
  },

  bookmark: async (collectionId: string): Promise<void> => {
    await apiClient.post(`/collections/${collectionId}/bookmark`);
  },

  unbookmark: async (collectionId: string): Promise<void> => {
    await apiClient.delete(`/collections/${collectionId}/bookmark`);
  },

  share: async (
    collectionId: string,
    data: { userId?: string; email?: string }
  ): Promise<{ shareId: string }> => {
    const response = await apiClient.post<{ shareId: string }>(
      `/collections/${collectionId}/share`,
      data
    );
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/collections/${id}`);
  },

  addItem: async (
    collectionId: string,
    data: AddItemToCollectionRequest
  ): Promise<void> => {
    await apiClient.post(`/collections/${collectionId}/items`, data);
  },

  bulkAddItems: async (
    collectionId: string,
    data: BulkAddItemsToCollectionRequest
  ): Promise<BulkAddItemsToCollectionResponse> => {
    const response = await apiClient.post<BulkAddItemsToCollectionResponse>(
      `/collections/${collectionId}/items/bulk`,
      data
    );
    return response.data;
  },

  removeItem: async (
    collectionId: string,
    itemId: string
  ): Promise<void> => {
    await apiClient.delete(`/collections/${collectionId}/items/${itemId}`);
  },

  getCollectionsForItem: async (
    itemId: string
  ): Promise<CollectionsResponse> => {
    const response = await apiClient.get<CollectionsResponse>(
      `/items/${itemId}/collections`
    );
    return response.data;
  },
};
