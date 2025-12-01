import { apiClient } from "./client";
import type { BulkCreateItemsRequest } from "@/types/api";

interface ReviewBoardItemResponse {
  id: string;
  category: string;
  subcategory: string;
  isPrivate: boolean;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  createdBy: string;
  createdAt: string;
}

interface ReviewBoardResponse {
  items: ReviewBoardItemResponse[];
}

export const adminApi = {
  getReviewBoardItems: async (): Promise<ReviewBoardResponse> => {
    const response = await apiClient.get<ReviewBoardResponse>(
      "/admin/items/review-board"
    );
    return response.data;
  },

  approveItem: async (id: string): Promise<ReviewBoardItemResponse> => {
    const response = await apiClient.put<ReviewBoardItemResponse>(
      `/admin/items/${id}/approval`
    );
    return response.data;
  },

  bulkCreateItems: async (
    data: BulkCreateItemsRequest
  ): Promise<{ created: number; skipped: number }> => {
    const response = await apiClient.post<{ created: number; skipped: number }>(
      "/items/bulk",
      data
    );
    return response.data;
  },
};
