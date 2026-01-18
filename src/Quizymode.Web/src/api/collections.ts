import { apiClient } from "./client";
import { itemsApi } from "./items";
import type {
  CollectionsResponse,
  CollectionResponse,
  ItemResponse,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  AddItemToCollectionRequest,
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

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/collections/${id}`);
  },

  addItem: async (
    collectionId: string,
    data: AddItemToCollectionRequest
  ): Promise<void> => {
    await apiClient.post(`/collections/${collectionId}/items`, data);
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
