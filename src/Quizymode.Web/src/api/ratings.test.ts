import { beforeEach, describe, expect, it, vi } from "vitest";
import { ratingsApi } from "./ratings";

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

describe("ratingsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getStats calls GET /ratings/:itemId and returns stats", async () => {
    const stats = { count: 5, averageStars: 4.2, itemId: "i1" };
    mockGet.mockResolvedValueOnce({ data: { stats } });
    const result = await ratingsApi.getStats("i1");
    expect(mockGet).toHaveBeenCalledWith("/ratings/i1");
    expect(result).toEqual(stats);
  });

  it("getUserRating calls GET /ratings/:itemId/me", async () => {
    const data = { id: "r1", itemId: "i1", stars: 4, createdAt: "2024-01-01" };
    mockGet.mockResolvedValueOnce({ data });
    const result = await ratingsApi.getUserRating("i1");
    expect(mockGet).toHaveBeenCalledWith("/ratings/i1/me");
    expect(result).toEqual(data);
  });

  it("getUserRating returns null when no rating", async () => {
    mockGet.mockResolvedValueOnce({ data: null });
    const result = await ratingsApi.getUserRating("i1");
    expect(result).toBeNull();
  });

  it("createOrUpdate calls POST /ratings/:itemId with stars", async () => {
    const data = { id: "r1", itemId: "i1", stars: 3, createdAt: "2024-01-01" };
    mockPost.mockResolvedValueOnce({ data });
    const result = await ratingsApi.createOrUpdate({ itemId: "i1", stars: 3 });
    expect(mockPost).toHaveBeenCalledWith("/ratings/i1", { stars: 3 });
    expect(result).toEqual(data);
  });

  it("createOrUpdate sends null stars", async () => {
    const data = { id: "r1", itemId: "i1", stars: null, createdAt: "2024-01-01" };
    mockPost.mockResolvedValueOnce({ data });
    const result = await ratingsApi.createOrUpdate({ itemId: "i1", stars: null });
    expect(mockPost).toHaveBeenCalledWith("/ratings/i1", { stars: null });
    expect(result).toEqual(data);
  });
});
