import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "./admin";

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("./client", () => ({
  apiClient: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}));

describe("adminApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getReviewBoardItems calls GET /admin/items/review-board", async () => {
    const data = { items: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getReviewBoardItems();
    expect(mockGet).toHaveBeenCalledWith("/admin/items/review-board");
    expect(result).toEqual(data);
  });

  it("approveItem calls PUT /admin/items/:id/approval", async () => {
    const data = { id: "i1" };
    mockPut.mockResolvedValueOnce({ data });
    const result = await adminApi.approveItem("i1");
    expect(mockPut).toHaveBeenCalledWith("/admin/items/i1/approval");
    expect(result).toEqual(data);
  });

  it("rejectItem calls PUT /admin/items/:id/rejection with reason", async () => {
    const data = { id: "i1" };
    mockPut.mockResolvedValueOnce({ data });
    const result = await adminApi.rejectItem("i1", "Inaccurate");
    expect(mockPut).toHaveBeenCalledWith("/admin/items/i1/rejection", { reason: "Inaccurate" });
    expect(result).toEqual(data);
  });

  it("getDatabaseSize calls GET /admin/database/size", async () => {
    const data = { sizeBytes: 1000, sizeMegabytes: 0.001, sizeGigabytes: 0, freeTierLimitMegabytes: 500, usagePercentage: 0 };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getDatabaseSize();
    expect(mockGet).toHaveBeenCalledWith("/admin/database/size");
    expect(result).toEqual(data);
  });

  it("getAuditLogs calls GET /admin/audit-logs with default params", async () => {
    const data = { logs: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getAuditLogs();
    expect(mockGet).toHaveBeenCalledWith("/admin/audit-logs", expect.objectContaining({
      params: expect.objectContaining({ page: 1, pageSize: 50 }),
    }));
    expect(result).toEqual(data);
  });

  it("getAuditLogs passes actionTypes as comma-joined string", async () => {
    mockGet.mockResolvedValueOnce({ data: { logs: [] } });
    await adminApi.getAuditLogs(["ItemCreated", "ItemDeleted"]);
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.actionTypes).toBe("ItemCreated,ItemDeleted");
  });

  it("getPageViewAnalytics calls GET /admin/page-view-analytics with defaults", async () => {
    const data = { summary: {}, topPages: [], recentPageViews: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getPageViewAnalytics();
    expect(mockGet).toHaveBeenCalledWith("/admin/page-view-analytics", expect.objectContaining({
      params: expect.objectContaining({ days: 7, visitorType: "all", page: 1, pageSize: 25 }),
    }));
    expect(result).toEqual(data);
  });

  it("getPageViewAnalytics includes pathContains when provided", async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    await adminApi.getPageViewAnalytics(7, "all", "  /home  ");
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.pathContains).toBe("/home");
  });

  it("getUsers calls GET /admin/users with defaults", async () => {
    const data = { summary: {}, users: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getUsers();
    expect(mockGet).toHaveBeenCalledWith("/admin/users", expect.objectContaining({
      params: expect.objectContaining({ activityDays: 30, activityFilter: "all", page: 1, pageSize: 25 }),
    }));
    expect(result).toEqual(data);
  });

  it("getUsers includes trimmed search when provided", async () => {
    mockGet.mockResolvedValueOnce({ data: { users: [] } });
    await adminApi.getUsers("  alice  ");
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.search).toBe("alice");
  });

  it("getUserActivity calls GET /admin/users/:id/page-view-history", async () => {
    const data = { user: {}, summary: {}, urlHistory: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getUserActivity("u1");
    expect(mockGet).toHaveBeenCalledWith("/admin/users/u1/page-view-history", expect.any(Object));
    expect(result).toEqual(data);
  });

  it("getUserSettings calls GET /admin/users/:id/settings", async () => {
    const data = { settings: { StudyGuideMaxBytes: "51200" } };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getUserSettings("u1");
    expect(mockGet).toHaveBeenCalledWith("/admin/users/u1/settings");
    expect(result).toEqual(data);
  });

  it("updateUserSetting calls PUT /admin/users/:id/settings", async () => {
    const data = { key: "StudyGuideMaxBytes", value: "100000", updatedAt: "" };
    mockPut.mockResolvedValueOnce({ data });
    const result = await adminApi.updateUserSetting("u1", "StudyGuideMaxBytes", "100000");
    expect(mockPut).toHaveBeenCalledWith("/admin/users/u1/settings", { key: "StudyGuideMaxBytes", value: "100000" });
    expect(result).toEqual(data);
  });

  it("getPendingKeywords calls GET /admin/keywords/pending", async () => {
    const data = { keywords: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getPendingKeywords();
    expect(mockGet).toHaveBeenCalledWith("/admin/keywords/pending");
    expect(result).toEqual(data);
  });

  it("approveKeyword calls POST /admin/keywords/:id/approve", async () => {
    const data = { id: "k1", name: "capitals", isPrivate: false, isReviewPending: false, createdAt: "" };
    mockPost.mockResolvedValueOnce({ data });
    const result = await adminApi.approveKeyword("k1");
    expect(mockPost).toHaveBeenCalledWith("/admin/keywords/k1/approve");
    expect(result).toEqual(data);
  });

  it("rejectKeyword calls POST /admin/keywords/:id/reject", async () => {
    const data = { id: "k1", name: "capitals", isPrivate: false, isReviewPending: false, createdAt: "" };
    mockPost.mockResolvedValueOnce({ data });
    const result = await adminApi.rejectKeyword("k1");
    expect(mockPost).toHaveBeenCalledWith("/admin/keywords/k1/reject");
    expect(result).toEqual(data);
  });

  it("previewSeedSync calls POST /admin/seed-sync/preview", async () => {
    const data = { seedSet: "test", isInitialSeed: true, changes: [] };
    mockPost.mockResolvedValueOnce({ data });
    const payload = { schemaVersion: 1, seedSet: "test", items: [] };
    const result = await adminApi.previewSeedSync(payload);
    expect(mockPost).toHaveBeenCalledWith("/admin/seed-sync/preview", payload);
    expect(result).toEqual(data);
  });

  it("applySeedSync calls POST /admin/seed-sync/apply", async () => {
    const data = { seedSet: "test", isInitialSeed: false, changes: [] };
    mockPost.mockResolvedValueOnce({ data });
    const payload = { schemaVersion: 1, seedSet: "test", items: [] };
    const result = await adminApi.applySeedSync(payload);
    expect(mockPost).toHaveBeenCalledWith("/admin/seed-sync/apply", payload);
    expect(result).toEqual(data);
  });

  it("getCategoryKeywords calls GET /admin/keywords", async () => {
    const data = { keywords: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await adminApi.getCategoryKeywords("geography", 1);
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.category).toBe("geography");
    expect(opts.params.rank).toBe(1);
    expect(result).toEqual(data);
  });

  it("createCategoryKeyword calls POST /admin/category-keywords", async () => {
    const data = { id: "ck1", categoryId: "c1", categoryName: "geo", keywordId: "k1", keywordName: "cap", navigationRank: 1, parentName: null, sortRank: 0 };
    mockPost.mockResolvedValueOnce({ data });
    const result = await adminApi.createCategoryKeyword({ categoryId: "c1", childKeywordId: "k1" });
    expect(mockPost).toHaveBeenCalledWith("/admin/category-keywords", { categoryId: "c1", childKeywordId: "k1" });
    expect(result).toEqual(data);
  });

  it("deleteCategoryKeyword calls DELETE /admin/category-keywords/:id", async () => {
    mockDelete.mockResolvedValueOnce({});
    await adminApi.deleteCategoryKeyword("ck1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/category-keywords/ck1");
  });

  it("deleteCategory calls DELETE /admin/categories/:id", async () => {
    mockDelete.mockResolvedValueOnce({});
    await adminApi.deleteCategory("cat1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/categories/cat1");
  });
});
