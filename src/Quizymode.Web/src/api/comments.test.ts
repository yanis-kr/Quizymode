import { beforeEach, describe, expect, it, vi } from "vitest";
import { commentsApi } from "./comments";

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

describe("commentsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getByItemId calls GET /comments with itemId param", async () => {
    const data = { comments: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await commentsApi.getByItemId("item-1");
    expect(mockGet).toHaveBeenCalledWith("/comments", { params: { itemId: "item-1" } });
    expect(result).toEqual(data);
  });

  it("create calls POST /comments with itemId and text", async () => {
    const data = { id: "c1", itemId: "item-1", text: "Nice!", createdBy: "u1", createdAt: "2024-01-01" };
    mockPost.mockResolvedValueOnce({ data });
    const result = await commentsApi.create({ itemId: "item-1", text: "Nice!" });
    expect(mockPost).toHaveBeenCalledWith("/comments", { itemId: "item-1", text: "Nice!" });
    expect(result).toEqual(data);
  });

  it("update calls PUT /comments/:id with text", async () => {
    const data = { id: "c1", itemId: "item-1", text: "Updated!", createdBy: "u1", createdAt: "2024-01-01" };
    mockPut.mockResolvedValueOnce({ data });
    const result = await commentsApi.update("c1", { text: "Updated!" });
    expect(mockPut).toHaveBeenCalledWith("/comments/c1", { text: "Updated!" });
    expect(result).toEqual(data);
  });

  it("delete calls DELETE /comments/:id", async () => {
    mockDelete.mockResolvedValueOnce({});
    await commentsApi.delete("c1");
    expect(mockDelete).toHaveBeenCalledWith("/comments/c1");
  });
});
