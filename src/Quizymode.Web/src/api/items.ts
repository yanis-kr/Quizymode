import { apiClient } from "./client";
import type {
  ItemsResponse,
  RandomItemsResponse,
  ItemResponse,
  CreateItemRequest,
  UpdateItemRequest,
  BulkCreateItemsRequest,
} from "@/types/api";

export const itemsApi = {
  getAll: async (
    category?: string,
    isPrivate?: boolean,
    keywords?: string[],
    collectionId?: string,
    isRandom?: boolean,
    page: number = 1,
    pageSize: number = 10
  ): Promise<ItemsResponse> => {
    const params: Record<string, string | number | boolean> = {
      page,
      pageSize,
    };
    if (category) params.category = category;
    if (isPrivate !== undefined) params.isPrivate = isPrivate;
    if (keywords && keywords.length > 0) params.keywords = keywords.join(",");
    if (collectionId) params.collectionId = collectionId;
    if (isRandom !== undefined) params.isRandom = isRandom;
    const response = await apiClient.get<ItemsResponse>("/items", { params });
    return response.data;
  },

  getById: async (id: string): Promise<ItemResponse> => {
    const response = await apiClient.get<ItemResponse>(`/items/${id}`);
    return response.data;
  },

  getRandom: async (
    category?: string,
    count: number = 10,
    keywords?: string[]
  ): Promise<RandomItemsResponse> => {
    const params: Record<string, string | number | boolean> = {
      isRandom: true,
      pageSize: count,
    };
    if (category) params.category = category;
    if (keywords && keywords.length > 0) params.keywords = keywords.join(",");
    const response = await apiClient.get<ItemsResponse>("/items", {
      params,
    });
    return { items: response.data.items };
  },

  create: async (data: CreateItemRequest): Promise<ItemResponse> => {
    const response = await apiClient.post<ItemResponse>("/items", data);
    return response.data;
  },

  update: async (
    id: string,
    data: UpdateItemRequest
  ): Promise<ItemResponse> => {
    const response = await apiClient.put<ItemResponse>(`/items/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/items/${id}`);
  },

  bulkCreate: async (
    data: BulkCreateItemsRequest
  ): Promise<{ created: number; skipped: number }> => {
    const response = await apiClient.post<{ created: number; skipped: number }>(
      "/items/bulk",
      data
    );
    return response.data;
  },

  setVisibility: async (
    id: string,
    isPrivate: boolean
  ): Promise<ItemResponse> => {
    const response = await apiClient.put<ItemResponse>(
      `/items/${id}/visibility`,
      { isPrivate }
    );
    return response.data;
  },
};
