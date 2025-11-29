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

  getCurrentUserRating: async (itemId: string): Promise<RatingResponse | null> => {
    // Note: There's no direct endpoint for this, we'll need to get all ratings and filter
    // For now, we'll handle this in the component by checking the response
    const response = await apiClient.get<{ stats: RatingStatsResponse }>("/ratings", {
      params: { itemId },
    });
    // This endpoint doesn't return user's rating, so we'll need to handle it differently
    return null;
  },

  createOrUpdate: async (data: CreateRatingRequest): Promise<RatingResponse> => {
    const response = await apiClient.post<RatingResponse>("/ratings", {
      itemId: data.itemId,
      stars: data.stars,
    });
    return response.data;
  },
};

