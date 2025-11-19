import { apiClient } from './client';
import type { ItemResponse, BulkCreateItemsRequest } from '@/types/api';

interface ReviewBoardResponse {
  items: ItemResponse[];
}

export const adminApi = {
  getReviewBoardItems: async (): Promise<ReviewBoardResponse> => {
    const response = await apiClient.get<ReviewBoardResponse>('/items/review-board');
    return response.data;
  },

  approveItem: async (id: string): Promise<ItemResponse> => {
    const response = await apiClient.put<ItemResponse>(`/items/${id}/approve`);
    return response.data;
  },

  bulkCreateItems: async (data: BulkCreateItemsRequest): Promise<{ created: number; skipped: number }> => {
    const response = await apiClient.post<{ created: number; skipped: number }>('/items/bulk', data);
    return response.data;
  },
};

