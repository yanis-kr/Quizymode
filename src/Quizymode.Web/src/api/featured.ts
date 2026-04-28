import { apiClient } from "./client";

export interface FeaturedSetDto {
  id: string;
  displayName: string;
  categorySlug: string;
  navKeyword1: string | null;
  navKeyword2: string | null;
  lastModifiedAt: string | null;
  sortOrder: number;
}

export interface FeaturedCollectionDto {
  id: string;
  collectionId: string | null;
  displayName: string;
  description: string | null;
  itemCount: number;
  lastModifiedAt: string | null;
  sortOrder: number;
}

export interface FeaturedResponse {
  sets: FeaturedSetDto[];
  collections: FeaturedCollectionDto[];
}

export interface AdminFeaturedItemDto {
  id: string;
  type: "Set" | "Collection";
  displayName: string;
  categorySlug: string | null;
  navKeyword1: string | null;
  navKeyword2: string | null;
  collectionId: string | null;
  collectionName: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface AdminFeaturedResponse {
  items: AdminFeaturedItemDto[];
}

export interface AddFeaturedItemRequest {
  type: "Set" | "Collection";
  displayName: string;
  categorySlug?: string;
  navKeyword1?: string;
  navKeyword2?: string;
  collectionId?: string;
  sortOrder?: number;
}

export const featuredApi = {
  get: async (): Promise<FeaturedResponse> => {
    const res = await apiClient.get<FeaturedResponse>("/featured");
    return res.data;
  },

  adminList: async (): Promise<AdminFeaturedResponse> => {
    const res = await apiClient.get<AdminFeaturedResponse>("/admin/featured");
    return res.data;
  },

  adminAdd: async (data: AddFeaturedItemRequest): Promise<{ id: string }> => {
    const res = await apiClient.post<{ id: string }>("/admin/featured", data);
    return res.data;
  },

  adminUpdate: async (id: string, data: { displayName?: string; sortOrder?: number }): Promise<void> => {
    await apiClient.patch(`/admin/featured/${id}`, data);
  },

  adminDelete: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/featured/${id}`);
  },
};
