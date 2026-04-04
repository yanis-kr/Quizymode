import { beforeEach, describe, expect, it, vi } from "vitest";
import { studyGuidesApi, studyGuideImportApi } from "./studyGuides";

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

describe("studyGuidesApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getCurrent calls GET /study-guides/current and returns data", async () => {
    const data = { id: "sg1", title: "My Guide", contentText: "...", sizeBytes: 100, createdUtc: "", updatedUtc: "", expiresAtUtc: "" };
    mockGet.mockResolvedValueOnce({ data });
    const result = await studyGuidesApi.getCurrent();
    expect(mockGet).toHaveBeenCalledWith("/study-guides/current");
    expect(result).toEqual(data);
  });

  it("getCurrent returns null on 404", async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 404 } });
    const result = await studyGuidesApi.getCurrent();
    expect(result).toBeNull();
  });

  it("getCurrent rethrows non-404 errors", async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 500 } });
    await expect(studyGuidesApi.getCurrent()).rejects.toMatchObject({ response: { status: 500 } });
  });

  it("upsert calls PUT /study-guides/current", async () => {
    const data = { id: "sg1", title: "Updated", sizeBytes: 200, updatedUtc: "", expiresAtUtc: "" };
    mockPut.mockResolvedValueOnce({ data });
    const result = await studyGuidesApi.upsert({ title: "Updated", contentText: "Content" });
    expect(mockPut).toHaveBeenCalledWith("/study-guides/current", { title: "Updated", contentText: "Content" });
    expect(result).toEqual(data);
  });

  it("delete calls DELETE /study-guides/current", async () => {
    mockDelete.mockResolvedValueOnce({});
    await studyGuidesApi.delete();
    expect(mockDelete).toHaveBeenCalledWith("/study-guides/current");
  });

  it("getEffectiveMaxBytes calls GET /users/settings and parses value", async () => {
    mockGet.mockResolvedValueOnce({ data: { settings: { StudyGuideMaxBytes: "100000" } } });
    const result = await studyGuidesApi.getEffectiveMaxBytes();
    expect(mockGet).toHaveBeenCalledWith("/users/settings");
    expect(result).toBe(100000);
  });

  it("getEffectiveMaxBytes returns default when settings missing", async () => {
    mockGet.mockResolvedValueOnce({ data: { settings: {} } });
    const result = await studyGuidesApi.getEffectiveMaxBytes();
    expect(result).toBe(studyGuidesApi.defaultMaxBytesPerUser);
  });

  it("getEffectiveMaxBytes clamps to max 1_000_000", async () => {
    mockGet.mockResolvedValueOnce({ data: { settings: { StudyGuideMaxBytes: "9999999" } } });
    const result = await studyGuidesApi.getEffectiveMaxBytes();
    expect(result).toBe(1_000_000);
  });

  it("getEffectiveMaxBytes clamps to 0 minimum", async () => {
    mockGet.mockResolvedValueOnce({ data: { settings: { StudyGuideMaxBytes: "-500" } } });
    const result = await studyGuidesApi.getEffectiveMaxBytes();
    expect(result).toBe(0);
  });

  it("getEffectiveMaxBytes returns default for non-numeric value", async () => {
    mockGet.mockResolvedValueOnce({ data: { settings: { StudyGuideMaxBytes: "not-a-number" } } });
    const result = await studyGuidesApi.getEffectiveMaxBytes();
    expect(result).toBe(studyGuidesApi.defaultMaxBytesPerUser);
  });
});

describe("studyGuideImportApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createSession calls POST /study-guides/import/sessions", async () => {
    const data = { sessionId: "s1", studyGuideId: "sg1", studyGuideTitle: "T", studyGuideSizeBytes: 100 };
    mockPost.mockResolvedValueOnce({ data });
    const result = await studyGuideImportApi.createSession({ categoryName: "geo", navigationKeywordPath: ["capitals"] });
    expect(mockPost).toHaveBeenCalledWith("/study-guides/import/sessions", expect.any(Object));
    expect(result).toEqual(data);
  });

  it("getSession calls GET /study-guides/import/sessions/:id", async () => {
    const data = { id: "s1", status: "pending", chunks: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await studyGuideImportApi.getSession("s1");
    expect(mockGet).toHaveBeenCalledWith("/study-guides/import/sessions/s1");
    expect(result).toEqual(data);
  });

  it("generateChunks calls POST /study-guides/import/sessions/:id/generate-chunks", async () => {
    const data = { chunks: [] };
    mockPost.mockResolvedValueOnce({ data });
    const result = await studyGuideImportApi.generateChunks("s1");
    expect(mockPost).toHaveBeenCalledWith("/study-guides/import/sessions/s1/generate-chunks");
    expect(result).toEqual(data);
  });

  it("submitChunkResult calls POST /study-guides/import/sessions/:id/chunks/:index/result", async () => {
    const data = { validationStatus: "ok", validationMessages: [], parsedItemsJson: null };
    mockPost.mockResolvedValueOnce({ data });
    const result = await studyGuideImportApi.submitChunkResult("s1", 0, "raw response");
    expect(mockPost).toHaveBeenCalledWith("/study-guides/import/sessions/s1/chunks/0/result", { rawResponseText: "raw response" });
    expect(result).toEqual(data);
  });

  it("submitDedupResult calls POST /study-guides/import/sessions/:id/dedup-result", async () => {
    const data = { validationStatus: "ok", validationMessages: [], parsedItemsJson: null };
    mockPost.mockResolvedValueOnce({ data });
    const result = await studyGuideImportApi.submitDedupResult("s1", "dedup response");
    expect(mockPost).toHaveBeenCalledWith("/study-guides/import/sessions/s1/dedup-result", { rawDedupResponseText: "dedup response" });
    expect(result).toEqual(data);
  });

  it("finalize calls POST /study-guides/import/sessions/:id/finalize", async () => {
    const data = { createdCount: 5, duplicateCount: 1, failedCount: 0, createdItemIds: [], errors: [] };
    mockPost.mockResolvedValueOnce({ data });
    const result = await studyGuideImportApi.finalize("s1");
    expect(mockPost).toHaveBeenCalledWith("/study-guides/import/sessions/s1/finalize");
    expect(result).toEqual(data);
  });
});
