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
    subcategory?: string,
    isPrivate?: boolean,
    page: number = 1,
    pageSize: number = 10
  ): Promise<ItemsResponse> => {
    const params: Record<string, string | number | boolean> = {
      page,
      pageSize,
    };
    if (category) params.category = category;
    if (subcategory) params.subcategory = subcategory;
    if (isPrivate !== undefined) params.isPrivate = isPrivate;
    const response = await apiClient.get<ItemsResponse>("/items", { params });
    return response.data;
  },

  getById: async (id: string): Promise<ItemResponse> => {
    const response = await apiClient.get<ItemResponse>(`/items/${id}`);
    return response.data;
  },

  getRandom: async (
    category?: string,
    subcategory?: string,
    count: number = 10
  ): Promise<RandomItemsResponse> => {
    const params: Record<string, string | number> = { count };
    if (category) params.category = category;
    if (subcategory) params.subcategory = subcategory;
    const response = await apiClient.get<RandomItemsResponse>("/items/random", {
      params,
    });
    return response.data;
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
