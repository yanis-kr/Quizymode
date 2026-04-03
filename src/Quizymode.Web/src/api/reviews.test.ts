import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewsApi } from "./reviews";

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

describe("reviewsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getByItemId calls GET /reviews?itemId=:id", async () => {
    const data = { reviews: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await reviewsApi.getByItemId("item-1");
    expect(mockGet).toHaveBeenCalledWith("/reviews?itemId=item-1");
    expect(result).toEqual(data);
  });

  it("create calls POST /reviews with data", async () => {
    const data = { id: "r1", itemId: "item-1" };
    mockPost.mockResolvedValueOnce({ data });
    const payload = { itemId: "item-1", text: "Great!" };
    const result = await reviewsApi.create(payload as never);
    expect(mockPost).toHaveBeenCalledWith("/reviews", payload);
    expect(result).toEqual(data);
  });

  it("update calls PUT /reviews/:id with data", async () => {
    const data = { id: "r1", itemId: "item-1", text: "Updated" };
    mockPut.mockResolvedValueOnce({ data });
    const result = await reviewsApi.update("r1", { text: "Updated" } as never);
    expect(mockPut).toHaveBeenCalledWith("/reviews/r1", { text: "Updated" });
    expect(result).toEqual(data);
  });

  it("delete calls DELETE /reviews/:id", async () => {
    mockDelete.mockResolvedValueOnce({});
    await reviewsApi.delete("r1");
    expect(mockDelete).toHaveBeenCalledWith("/reviews/r1");
  });
});
