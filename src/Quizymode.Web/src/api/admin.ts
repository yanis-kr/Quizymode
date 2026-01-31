import { apiClient } from "./client";
import type { BulkCreateItemsRequest } from "@/types/api";

interface ReviewBoardItemResponse {
  id: string;
  category: string;
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

interface DatabaseSizeResponse {
  sizeBytes: number;
  sizeMegabytes: number;
  sizeGigabytes: number;
  freeTierLimitMegabytes: number;
  usagePercentage: number;
}

interface AuditLogResponse {
  id: string;
  userEmail: string | null;
  ipAddress: string;
  action: string | number; // Can be string or number depending on serialization
  entityId: string | null;
  createdUtc: string;
  metadata: Record<string, string>;
}

interface AuditLogsResponse {
  logs: AuditLogResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

  getDatabaseSize: async (): Promise<DatabaseSizeResponse> => {
    const response = await apiClient.get<DatabaseSizeResponse>(
      "/admin/database/size"
    );
    return response.data;
  },

    getAuditLogs: async (
    actionTypes?: string[],
    page: number = 1,
    pageSize: number = 50
  ): Promise<AuditLogsResponse> => {
    const params: Record<string, string | number> = {
      page,
      pageSize,
    };
    if (actionTypes && actionTypes.length > 0) {
      params.actionTypes = actionTypes.join(",");
    }
    const response = await apiClient.get<AuditLogsResponse>(
      "/admin/audit-logs",
      { params }
    );
    return response.data;
  },

  getCategoryKeywords: async (
    category?: string | null,
    rank?: number | null
  ): Promise<CategoryKeywordsAdminResponse> => {
    const params: Record<string, string | number> = {};
    if (category) params.category = category;
    if (rank != null) params.rank = rank;
    const response = await apiClient.get<CategoryKeywordsAdminResponse>(
      "/admin/keywords",
      { params }
    );
    return response.data;
  },

  updateCategoryKeyword: async (
    id: string,
    data: UpdateCategoryKeywordRequest
  ): Promise<CategoryKeywordAdminResponse> => {
    const response = await apiClient.put<CategoryKeywordAdminResponse>(
      `/admin/category-keywords/${id}`,
      data
    );
    return response.data;
  },

  updateCategory: async (
    id: string,
    data: UpdateCategoryRequest
  ): Promise<UpdateCategoryResponse> => {
    const response = await apiClient.put<UpdateCategoryResponse>(
      `/admin/categories/${id}`,
      data
    );
    return response.data;
  },
};

export interface UpdateCategoryRequest {
  name: string;
}

export interface UpdateCategoryResponse {
  id: string;
  name: string;
}

export interface CategoryKeywordAdminResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  keywordId: string;
  keywordName: string;
  navigationRank: number | null;
  parentName: string | null;
  sortRank: number;
}

export interface CategoryKeywordsAdminResponse {
  keywords: CategoryKeywordAdminResponse[];
}

export interface UpdateCategoryKeywordRequest {
  parentName?: string | null;
  navigationRank?: number | null;
  sortRank?: number | null;
}
