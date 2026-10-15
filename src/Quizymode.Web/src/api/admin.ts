import { apiClient } from "./client";
import type { BulkCreateItemsRequest, ItemSpeechSupport } from "@/types/api";

interface ReviewBoardItemResponse {
  id: string;
  category: string;
  isPrivate: boolean;
  question: string;
  questionSpeech?: ItemSpeechSupport | null;
  correctAnswer: string;
  correctAnswerSpeech?: ItemSpeechSupport | null;
  incorrectAnswers: string[];
  incorrectAnswerSpeech?: Record<number, ItemSpeechSupport> | null;
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

export interface DatabaseSizeTableResponse {
  tableName: string;
  sizeBytes: number;
  sizeMegabytes: number;
  sizeGigabytes: number;
}

export interface DatabaseSizeResponse {
  sizeBytes: number;
  sizeMegabytes: number;
  sizeGigabytes: number;
  freeTierLimitMegabytes: number;
  usagePercentage: number;
  itemCount: number;
  keywordCount: number;
  topTables: DatabaseSizeTableResponse[];
}

interface AuditLogResponse {
  id: string;
  userEmail: string | null;
  ipAddress: string;
  country?: string | null;
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
  botSessions: number;
  botsExcluded: boolean;
  /** Sessions with any internal hit or an internal user; counted even when excluded. */
  internalSessions: number;
  internalExcluded: boolean;
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
  country?: string | null;
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

/**
 * A session's outcome is decided by its FIRST hit, so the three values are
 * mutually exclusive: "converted" means it started anonymous and then signed in.
 */
export type SessionOutcome = "anonymous" | "converted" | "authenticated";

export type SessionOutcomeFilter = "all" | SessionOutcome;

export type SessionSortBy = "recent" | "pages" | "duration";

export interface SessionOutcomeStats {
  outcome: SessionOutcome;
  sessions: number;
  bouncedSessions: number;
  bounceRatePercent: number;
  engagedSessions: number;
  avgPagesPerSession: number;
}

export interface PageViewSessionsSummary {
  windowStartUtc: string;
  windowEndUtc: string;
  totalSessions: number;
  totalPageHits: number;
  bouncedSessions: number;
  bounceRatePercent: number;
  engagedSessions: number;
  avgPagesPerSession: number;
  /** Averaged over non-bounce sessions only; bounces always have zero duration. */
  avgDurationSecondsEngaged: number;
  medianDurationSecondsEngaged: number;
  botSessions: number;
  botsExcluded: boolean;
  internalSessions: number;
  internalExcluded: boolean;
  byOutcome: SessionOutcomeStats[];
}

export interface SessionDepthBucket {
  label: string;
  totalSessions: number;
  anonymousSessions: number;
  convertedSessions: number;
  authenticatedSessions: number;
}

export interface LandingPageResponse {
  path: string;
  sessions: number;
  bouncedSessions: number;
  bounceRatePercent: number;
  avgPagesPerSession: number;
}

export interface PageViewSessionResponse {
  sessionId: string;
  outcome: SessionOutcome;
  startedUtc: string;
  endedUtc: string;
  pageHits: number;
  distinctPages: number;
  durationSeconds: number;
  isBounce: boolean;
  entryPath: string;
  exitPath: string;
  ipAddress: string;
  country?: string | null;
  userEmail: string | null;
  /** Null for hits recorded before user-agent capture existed. */
  userAgent: string | null;
  isBot: boolean;
  isInternal: boolean;
}

export interface PageViewSessionsResponse {
  summary: PageViewSessionsSummary;
  depthBuckets: SessionDepthBucket[];
  landingPages: LandingPageResponse[];
  sessions: PageViewSessionResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SessionJourneyStep {
  stepNumber: number;
  path: string;
  queryString: string;
  url: string;
  isAuthenticated: boolean;
  createdUtc: string;
  /** Null on the final step: no exit event is recorded, so dwell time is unknown. */
  dwellSeconds: number | null;
}

export interface PageViewSessionDetailResponse {
  sessionId: string;
  outcome: SessionOutcome;
  startedUtc: string;
  endedUtc: string;
  pageHits: number;
  distinctPages: number;
  durationSeconds: number;
  isBounce: boolean;
  ipAddress: string;
  country?: string | null;
  userEmail: string | null;
  userAgent: string | null;
  isBot: boolean;
  isInternal: boolean;
  steps: SessionJourneyStep[];
}

export interface ConversionFunnelStep {
  eventName: string;
  sessions: number;
  events: number;
  /** Null for the first step or when the previous step had no sessions. */
  conversionFromPreviousPercent: number | null;
  conversionFromFirstPercent: number | null;
}

export interface ConversionFunnelResponse {
  windowStartUtc: string;
  windowEndUtc: string;
  sessionsWithEvents: number;
  botSessions: number;
  botsExcluded: boolean;
  internalSessions: number;
  internalExcluded: boolean;
  steps: ConversionFunnelStep[];
}

export interface LearningScopeResponse {
  mode: string;
  contextType: string | null;
  contextId: string | null;
  runsStarted: number;
  /** Null for flashcards, which have no completion. */
  runsCompleted: number | null;
  completionRatePercent: number | null;
  averageScorePercent: number | null;
  averageItemsReached: number;
}

export interface LearningDropOffPointResponse {
  position: number;
  runsReached: number;
  sharePercent: number;
  runsAbandonedHere: number;
}

export interface LearningReportResponse {
  windowStartUtc: string;
  windowEndUtc: string;
  botSessions: number;
  botsExcluded: boolean;
  internalSessions: number;
  internalExcluded: boolean;
  scopes: LearningScopeResponse[];
  quizRunsAbandonedBeforeFirstAnswer: number;
  quizDropOff: LearningDropOffPointResponse[];
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
  internalUsers: number;
  internalSessions: number;
  internalExcluded: boolean;
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
  lastKnownCountry?: string | null;
  isInternal: boolean;
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
  internalSessions: number;
  internalExcluded: boolean;
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
  isInternal: boolean;
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
  sinceCommitSha?: string | null;
  fileOffset?: number;
  fileBatchSize?: number;
}

export interface LocalSeedSyncRequest {
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
  collectionsPath: string;
  collectionSourceFileCount: number;
  seedSet: string;
  totalItemsInPayload: number;
  existingItemCount: number;
  affectedItemCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  unchangedCount: number;
  totalCollectionsInPayload: number;
  existingCollectionCount: number;
  affectedCollectionCount: number;
  collectionCreatedCount: number;
  collectionUpdatedCount: number;
  collectionDeletedCount: number;
  collectionUnchangedCount: number;
  totalFiles: number;
  processedFiles: number;
  nextFileOffset: number;
  isComplete: boolean;
  durationMs: number;
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
  collectionsPath: string;
  collectionSourceFileCount: number;
  seedSet: string;
  totalItemsInPayload: number;
  existingItemCount: number;
  affectedItemCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  unchangedCount: number;
  totalCollectionsInPayload: number;
  existingCollectionCount: number;
  affectedCollectionCount: number;
  collectionCreatedCount: number;
  collectionUpdatedCount: number;
  collectionDeletedCount: number;
  collectionUnchangedCount: number;
  totalFiles: number;
  processedFiles: number;
  nextFileOffset: number;
  isComplete: boolean;
  durationMs: number;
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
    userEmail?: string,
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
    if (userEmail && userEmail.trim().length > 0) {
      params.userEmail = userEmail.trim();
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
    topPagesLimit: number = 10,
    includeBots: boolean = false,
    includeInternal: boolean = false
  ): Promise<PageViewAnalyticsResponse> => {
    const params: Record<string, string | number | boolean> = {
      days,
      visitorType,
      page,
      pageSize,
      topPagesLimit,
      includeBots,
    };
    if (pathContains && pathContains.trim().length > 0) {
      params.pathContains = pathContains.trim();
    }
    if (includeInternal) {
      params.includeInternal = true;
    }

    const response = await apiClient.get<PageViewAnalyticsResponse>(
      "/admin/page-view-analytics",
      { params }
    );
    return response.data;
  },

  getPageViewSessions: async (
    days: number = 7,
    outcome: SessionOutcomeFilter = "all",
    minPages?: number,
    includeBots: boolean = false,
    sortBy: SessionSortBy = "recent",
    page: number = 1,
    pageSize: number = 25,
    landingPagesLimit: number = 10,
    includeInternal: boolean = false
  ): Promise<PageViewSessionsResponse> => {
    const params: Record<string, string | number | boolean> = {
      days,
      outcome,
      includeBots,
      sortBy,
      page,
      pageSize,
      landingPagesLimit,
    };
    if (minPages && minPages > 1) {
      params.minPages = minPages;
    }
    if (includeInternal) {
      params.includeInternal = true;
    }

    const response = await apiClient.get<PageViewSessionsResponse>(
      "/admin/page-view-sessions",
      { params }
    );
    return response.data;
  },

  getPageViewSessionDetail: async (
    sessionId: string,
    includeInternal: boolean = false
  ): Promise<PageViewSessionDetailResponse> => {
    const url = `/admin/page-view-sessions/${encodeURIComponent(sessionId)}`;
    const response = includeInternal
      ? await apiClient.get<PageViewSessionDetailResponse>(url, {
          params: { includeInternal: true },
        })
      : await apiClient.get<PageViewSessionDetailResponse>(url);
    return response.data;
  },

  getConversionFunnel: async (
    days: number = 7,
    includeBots: boolean = false,
    includeInternal: boolean = false
  ): Promise<ConversionFunnelResponse> => {
    const params: Record<string, number | boolean> = { days, includeBots };
    if (includeInternal) {
      params.includeInternal = true;
    }

    const response = await apiClient.get<ConversionFunnelResponse>(
      "/admin/analytics/funnel",
      { params }
    );
    return response.data;
  },

  getLearningReport: async (
    days: number = 7,
    includeBots: boolean = false,
    includeInternal: boolean = false
  ): Promise<LearningReportResponse> => {
    const params: Record<string, number | boolean> = { days, includeBots };
    if (includeInternal) {
      params.includeInternal = true;
    }

    const response = await apiClient.get<LearningReportResponse>(
      "/admin/analytics/learning",
      { params }
    );
    return response.data;
  },

  getUsers: async (
    search?: string,
    activityDays: number = 30,
    activityFilter: AdminUserActivityFilter = "all",
    page: number = 1,
    pageSize: number = 25,
    includeInternal: boolean = false
  ): Promise<AdminUsersResponse> => {
    const params: Record<string, string | number | boolean> = {
      activityDays,
      activityFilter,
      page,
      pageSize,
    };
    if (search && search.trim().length > 0) {
      params.search = search.trim();
    }
    if (includeInternal) {
      params.includeInternal = true;
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
    pageSize: number = 25,
    includeInternal: boolean = false
  ): Promise<AdminUserActivityResponse> => {
    const params: Record<string, string | number | boolean> = {
      days,
      page,
      pageSize,
    };
    if (urlContains && urlContains.trim().length > 0) {
      params.urlContains = urlContains.trim();
    }
    if (includeInternal) {
      params.includeInternal = true;
    }

    const response = await apiClient.get<AdminUserActivityResponse>(
      `/admin/users/${userId}/page-view-history`,
      { params }
    );
    return response.data;
  },

  setUserInternal: async (
    userId: string,
    isInternal: boolean
  ): Promise<{ id: string; isInternal: boolean }> => {
    const response = await apiClient.put<{ id: string; isInternal: boolean }>(
      `/admin/users/${userId}/internal`,
      { isInternal }
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

  previewLocalSeedSync: async (
    data: LocalSeedSyncRequest
  ): Promise<SeedSyncPreviewResponse> => {
    const response = await apiClient.post<SeedSyncPreviewResponse>(
      "/admin/seed-sync/local/preview",
      data
    );
    return response.data;
  },

  applyLocalSeedSync: async (
    data: LocalSeedSyncRequest
  ): Promise<SeedSyncApplyResponse> => {
    const response = await apiClient.post<SeedSyncApplyResponse>(
      "/admin/seed-sync/local/apply",
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
