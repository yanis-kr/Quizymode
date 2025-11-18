import { apiClient } from './client';
import type {
  ReviewsResponse,
  ReviewResponse,
  CreateReviewRequest,
  UpdateReviewRequest,
} from '@/types/api';

export const reviewsApi = {
  getByItemId: async (itemId: string): Promise<ReviewsResponse> => {
    const response = await apiClient.get<ReviewsResponse>(`/reviews?itemId=${itemId}`);
    return response.data;
  },

  create: async (data: CreateReviewRequest): Promise<ReviewResponse> => {
    const response = await apiClient.post<ReviewResponse>('/reviews', data);
    return response.data;
  },

  update: async (id: string, data: UpdateReviewRequest): Promise<ReviewResponse> => {
    const response = await apiClient.put<ReviewResponse>(`/reviews/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/reviews/${id}`);
  },
};

