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
  factualRisk?: number | null;
  reviewComments?: string | null;
}

interface ReviewBoardResponse {
  items: ReviewBoardItemResponse[];
}

export interface PendingKeywordResponse {
  id: string;
  name: string;
  slug?: string | null;
  isPrivate: boolean;
  createdBy: string;
  createdAt: string;
  usageCount: number;
}

export interface PendingKeywordsResponse {
  keywords: PendingKeywordResponse[];
}

export interface KeywordReviewResponse {
  id: string;
  name: string;
  slug?: string | null;
  isPrivate: boolean;
  isReviewPending: boolean;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
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

  rejectItem: async (
    id: string,
    reason?: string
  ): Promise<ReviewBoardItemResponse> => {
    const response = await apiClient.put<ReviewBoardItemResponse>(
      `/admin/items/${id}/rejection`,
      { reason }
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

  createCategoryKeyword: async (
    data: CreateCategoryKeywordRequest
  ): Promise<CategoryKeywordAdminResponse> => {
    const response = await apiClient.post<CategoryKeywordAdminResponse>(
      "/admin/category-keywords",
      data
    );
    return response.data;
  },

  deleteCategoryKeyword: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/category-keywords/${id}`);
  },

  getAvailableKeywordsForCategory: async (
    categoryId: string
  ): Promise<AvailableKeywordsResponse> => {
    const response = await apiClient.get<AvailableKeywordsResponse>(
      `/admin/categories/${categoryId}/keywords-available`
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

  createCategory: async (
    data: CreateCategoryRequest
  ): Promise<CreateCategoryResponse> => {
    const response = await apiClient.post<CreateCategoryResponse>(
      "/admin/categories",
      data
    );
    return response.data;
  },

  deleteCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/categories/${id}`);
  },

  getPendingKeywords: async (): Promise<PendingKeywordsResponse> => {
    const response = await apiClient.get<PendingKeywordsResponse>(
      "/admin/keywords/pending"
    );
    return response.data;
  },

  approveKeyword: async (id: string): Promise<KeywordReviewResponse> => {
    const response = await apiClient.post<KeywordReviewResponse>(
      `/admin/keywords/${id}/approve`
    );
    return response.data;
  },

  rejectKeyword: async (id: string): Promise<KeywordReviewResponse> => {
    const response = await apiClient.post<KeywordReviewResponse>(
      `/admin/keywords/${id}/reject`
    );
    return response.data;
  },
};

export interface CreateCategoryRequest {
  name: string;
  description?: string | null;
  shortDescription?: string | null;
}

export interface CreateCategoryResponse {
  id: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
}

export interface UpdateCategoryRequest {
  name: string;
  description?: string | null;
  shortDescription?: string | null;
}

export interface UpdateCategoryResponse {
  id: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
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
  description?: string | null;
}

export interface CreateCategoryKeywordRequest {
  categoryId: string;
  keywordId: string;
  navigationRank: number;
  parentName?: string | null;
  sortRank?: number;
  description?: string | null;
}

export interface KeywordOption {
  id: string;
  name: string;
}

export interface AvailableKeywordsResponse {
  keywords: KeywordOption[];
}

export interface CategoryKeywordsAdminResponse {
  keywords: CategoryKeywordAdminResponse[];
}

export interface UpdateCategoryKeywordRequest {
  parentName?: string | null;
  navigationRank?: number | null;
  sortRank?: number | null;
  description?: string | null;
}
