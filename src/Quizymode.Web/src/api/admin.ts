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

export type PageViewVisitorType = "all" | "authenticated" | "anonymous";

export interface PageViewAnalyticsSummary {
  windowStartUtc: string;
  windowEndUtc: string;
  totalPageViews: number;
  uniquePages: number;
  uniqueSessions: number;
  authenticatedPageViews: number;
  anonymousPageViews: number;
  authenticatedSessions: number;
  anonymousSessions: number;
}

export interface TopPageAnalyticsResponse {
  path: string;
  totalViews: number;
  uniqueSessions: number;
  authenticatedViews: number;
  anonymousViews: number;
  lastVisitedUtc: string;
}

export interface RecentPageViewResponse {
  id: string;
  url: string;
  path: string;
  queryString: string;
  sessionId: string;
  ipAddress: string;
  isAuthenticated: boolean;
  userEmail: string | null;
  createdUtc: string;
}

export interface PageViewAnalyticsResponse {
  summary: PageViewAnalyticsSummary;
  topPages: TopPageAnalyticsResponse[];
  recentPageViews: RecentPageViewResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type AdminUserActivityFilter =
  | "all"
  | "with-activity"
  | "without-activity";

export interface AdminUsersSummaryResponse {
  activityWindowStartUtc: string;
  activityWindowEndUtc: string;
  totalRegisteredUsers: number;
  filteredUsers: number;
  usersWithActivityInWindow: number;
  usersWithoutActivityInWindow: number;
}

export interface AdminUserOverviewResponse {
  id: string;
  name?: string | null;
  email?: string | null;
  createdAt: string;
  lastLogin: string;
  uniqueUrlsInWindow: number;
  totalPageViewsInWindow: number;
  lastOpenedUtc?: string | null;
}

export interface AdminUsersResponse {
  summary: AdminUsersSummaryResponse;
  users: AdminUserOverviewResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminUserActivitySummaryResponse {
  windowStartUtc: string;
  windowEndUtc: string;
  totalViews: number;
  uniqueUrls: number;
  lastOpenedUtc?: string | null;
}

export interface AdminUserUrlHistoryResponse {
  url: string;
  path: string;
  queryString: string;
  openCount: number;
  firstOpenedUtc: string;
  lastOpenedUtc: string;
}

export interface AdminUserDetailResponse {
  id: string;
  name?: string | null;
  email?: string | null;
  createdAt: string;
  lastLogin: string;
}

export interface AdminUserActivityResponse {
  user: AdminUserDetailResponse;
  summary: AdminUserActivitySummaryResponse;
  urlHistory: AdminUserUrlHistoryResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminUserSettingsResponse {
  settings: Record<string, string>;
}

export interface AdminUserSettingUpdateResponse {
  key: string;
  value: string;
  updatedAt: string;
}

export interface SeedSyncRequest {
  schemaVersion: number;
  repositoryOwner: string;
  repositoryName: string;
  gitRef: string;
  deltaPreviewLimit?: number;
}

export interface SeedSyncChangeResponse {
  itemId: string;
  action: string;
  category: string;
  navigationKeyword1: string;
  navigationKeyword2: string;
  question: string;
  changedFields: string[];
}

export interface SeedSyncPreviewResponse {
  repositoryOwner: string;
  repositoryName: string;
  gitRef: string;
  resolvedCommitSha: string;
  itemsPath: string;
  sourceFileCount: number;
  seedSet: string;
  totalItemsInPayload: number;
  existingItemCount: number;
  affectedItemCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  unchangedCount: number;
  hasMoreChanges: boolean;
  changes: SeedSyncChangeResponse[];
}

export interface SeedSyncApplyResponse {
  repositoryOwner: string;
  repositoryName: string;
  gitRef: string;
  resolvedCommitSha: string;
  itemsPath: string;
  sourceFileCount: number;
  seedSet: string;
  totalItemsInPayload: number;
  existingItemCount: number;
  affectedItemCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  unchangedCount: number;
  historyRunId?: string | null;
  historyRecordedUtc?: string | null;
  hasMoreChanges: boolean;
  changes: SeedSyncChangeResponse[];
}

export interface SeedSyncHistoryItemResponse {
  itemId: string;
  action: string;
  category: string;
  navigationKeyword1: string;
  navigationKeyword2: string;
  question: string;
  changedFields: string[];
}

export interface SeedSyncHistoryRunResponse {
  runId: string;
  createdUtc: string;
  triggeredByUserId?: string | null;
  repositoryOwner: string;
  repositoryName: string;
  gitRef: string;
  resolvedCommitSha: string;
  itemsPath: string;
  seedSet: string;
  sourceFileCount: number;
  totalItemsInPayload: number;
  existingItemCount: number;
  affectedItemCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  unchangedCount: number;
  hasMoreChanges: boolean;
  changes: SeedSyncHistoryItemResponse[];
}

export interface SeedSyncHistoryResponse {
  runs: SeedSyncHistoryRunResponse[];
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

  getPageViewAnalytics: async (
    days: number = 7,
    visitorType: PageViewVisitorType = "all",
    pathContains?: string,
    page: number = 1,
    pageSize: number = 25,
    topPagesLimit: number = 10
  ): Promise<PageViewAnalyticsResponse> => {
    const params: Record<string, string | number> = {
      days,
      visitorType,
      page,
      pageSize,
      topPagesLimit,
    };
    if (pathContains && pathContains.trim().length > 0) {
      params.pathContains = pathContains.trim();
    }

    const response = await apiClient.get<PageViewAnalyticsResponse>(
      "/admin/page-view-analytics",
      { params }
    );
    return response.data;
  },

  getUsers: async (
    search?: string,
    activityDays: number = 30,
    activityFilter: AdminUserActivityFilter = "all",
    page: number = 1,
    pageSize: number = 25
  ): Promise<AdminUsersResponse> => {
    const params: Record<string, string | number> = {
      activityDays,
      activityFilter,
      page,
      pageSize,
    };
    if (search && search.trim().length > 0) {
      params.search = search.trim();
    }

    const response = await apiClient.get<AdminUsersResponse>("/admin/users", {
      params,
    });
    return response.data;
  },

  getUserActivity: async (
    userId: string,
    days: number = 30,
    urlContains?: string,
    page: number = 1,
    pageSize: number = 25
  ): Promise<AdminUserActivityResponse> => {
    const params: Record<string, string | number> = {
      days,
      page,
      pageSize,
    };
    if (urlContains && urlContains.trim().length > 0) {
      params.urlContains = urlContains.trim();
    }

    const response = await apiClient.get<AdminUserActivityResponse>(
      `/admin/users/${userId}/page-view-history`,
      { params }
    );
    return response.data;
  },

  getUserSettings: async (
    userId: string
  ): Promise<AdminUserSettingsResponse> => {
    const response = await apiClient.get<AdminUserSettingsResponse>(
      `/admin/users/${userId}/settings`
    );
    return response.data;
  },

  updateUserSetting: async (
    userId: string,
    key: string,
    value: string
  ): Promise<AdminUserSettingUpdateResponse> => {
    const response = await apiClient.put<AdminUserSettingUpdateResponse>(
      `/admin/users/${userId}/settings`,
      { key, value }
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

  createKeyword: async (name: string): Promise<KeywordOption> => {
    const response = await apiClient.post<{ id: string; name: string; slug: string | null }>(
      "/admin/keywords",
      { name }
    );
    return { id: response.data.id, name: response.data.name };
  },

  updateKeyword: async (id: string, name: string): Promise<KeywordOption> => {
    const response = await apiClient.put<{ id: string; name: string; slug: string | null }>(
      `/admin/keywords/${id}`,
      { name }
    );
    return { id: response.data.id, name: response.data.name };
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

  previewSeedSync: async (
    data: SeedSyncRequest
  ): Promise<SeedSyncPreviewResponse> => {
    const response = await apiClient.post<SeedSyncPreviewResponse>(
      "/admin/seed-sync/preview",
      data
    );
    return response.data;
  },

  applySeedSync: async (
    data: SeedSyncRequest
  ): Promise<SeedSyncApplyResponse> => {
    const response = await apiClient.post<SeedSyncApplyResponse>(
      "/admin/seed-sync/apply",
      data
    );
    return response.data;
  },

  getSeedSyncHistory: async (
    take: number = 5,
    changesPerRun: number = 10
  ): Promise<SeedSyncHistoryResponse> => {
    const response = await apiClient.get<SeedSyncHistoryResponse>(
      "/admin/seed-sync/history",
      {
        params: { take, changesPerRun },
      }
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
  parentKeywordId?: string | null;
  childKeywordId: string;
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
  parentKeywordId?: string | null;
  sortRank?: number | null;
  description?: string | null;
}
