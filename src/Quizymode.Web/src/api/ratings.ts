import { apiClient } from "./client";

export interface RatingStatsResponse {
  count: number;
  averageStars: number | null;
  itemId: string | null;
}

export interface RatingResponse {
  id: string;
  itemId: string;
  stars: number | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface CreateRatingRequest {
  itemId: string;
  stars: number | null;
}

export const ratingsApi = {
  getStats: async (itemId?: string): Promise<RatingStatsResponse> => {
    const params = itemId ? { itemId } : {};
    const response = await apiClient.get<{ stats: RatingStatsResponse }>("/ratings", { params });
    return response.data.stats;
  },

  getUserRating: async (itemId: string): Promise<RatingResponse | null> => {
    const response = await apiClient.get<RatingResponse | null>("/ratings/me", {
      params: { itemId },
    });
    return response.data;
  },

  createOrUpdate: async (data: CreateRatingRequest): Promise<RatingResponse> => {
    const response = await apiClient.post<RatingResponse>("/ratings", {
      itemId: data.itemId,
      stars: data.stars,
    });
    return response.data;
  },
};

