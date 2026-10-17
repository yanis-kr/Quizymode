import { beforeEach, describe, expect, it, vi } from "vitest";
import { studyGuideUploadsApi } from "./studyGuideUploads";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("./client", () => ({
  apiClient: {
    get: mockGet,
    post: mockPost,
  },
}));

describe("studyGuideUploadsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getConfig calls GET /study-guide-uploads/config", async () => {
    mockGet.mockResolvedValueOnce({ data: { enabled: true, maxTextBytes: 10240, maxQuestions: 20 } });
    const result = await studyGuideUploadsApi.getConfig();
    expect(mockGet).toHaveBeenCalledWith("/study-guide-uploads/config");
    expect(result.enabled).toBe(true);
  });

  it("create posts the upload request", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "u1", status: "Pending", isDuplicate: false } });
    const request = {
      text: "notes",
      category: "science",
      navigationKeyword1: "biology",
      navigationKeyword2: "plants",
      keywords: ["exam"],
    };
    const result = await studyGuideUploadsApi.create(request);
    expect(mockPost).toHaveBeenCalledWith("/study-guide-uploads", request);
    expect(result.id).toBe("u1");
  });

  it("get calls GET /study-guide-uploads/{id}", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "u1", status: "Completed" } });
    await studyGuideUploadsApi.get("u1");
    expect(mockGet).toHaveBeenCalledWith("/study-guide-uploads/u1");
  });

  it("accept posts selected question indexes", async () => {
    mockPost.mockResolvedValueOnce({ data: { createdCount: 2 } });
    await studyGuideUploadsApi.accept("u1", [0, 2]);
    expect(mockPost).toHaveBeenCalledWith("/study-guide-uploads/u1/accept", { questionIndexes: [0, 2] });
  });
});
