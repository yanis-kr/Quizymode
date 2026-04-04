import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectionsApi } from "./collections";

const { mockGet, mockPost, mockPut, mockDelete, mockItemsGetAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
  mockItemsGetAll: vi.fn(),
}));

vi.mock("./client", () => ({
  apiClient: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}));

vi.mock("./items", () => ({
  itemsApi: {
    getAll: mockItemsGetAll,
  },
}));

describe("collectionsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll calls GET /collections", async () => {
    const data = { collections: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await collectionsApi.getAll();
    expect(mockGet).toHaveBeenCalledWith("/collections");
    expect(result).toEqual(data);
  });

  it("getById calls GET /collections/:id", async () => {
    const data = { id: "c1", name: "Test" };
    mockGet.mockResolvedValueOnce({ data });
    const result = await collectionsApi.getById("c1");
    expect(mockGet).toHaveBeenCalledWith("/collections/c1");
    expect(result).toEqual(data);
  });

  it("create calls POST /collections with payload", async () => {
    const data = { id: "new", name: "New Col" };
    mockPost.mockResolvedValueOnce({ data });
    const result = await collectionsApi.create({ name: "New Col", description: null, isPublic: false });
    expect(mockPost).toHaveBeenCalledWith("/collections", expect.objectContaining({ name: "New Col" }));
    expect(result).toEqual(data);
  });

  it("update calls PUT /collections/:id", async () => {
    const data = { id: "c1", name: "Updated" };
    mockPut.mockResolvedValueOnce({ data });
    const result = await collectionsApi.update("c1", { name: "Updated", description: null });
    expect(mockPut).toHaveBeenCalledWith("/collections/c1", expect.any(Object));
    expect(result).toEqual(data);
  });

  it("delete calls DELETE /collections/:id", async () => {
    mockDelete.mockResolvedValueOnce({});
    await collectionsApi.delete("c1");
    expect(mockDelete).toHaveBeenCalledWith("/collections/c1");
  });

  it("bookmark calls POST /collections/:id/bookmark", async () => {
    mockPost.mockResolvedValueOnce({});
    await collectionsApi.bookmark("c1");
    expect(mockPost).toHaveBeenCalledWith("/collections/c1/bookmark");
  });

  it("unbookmark calls DELETE /collections/:id/bookmark", async () => {
    mockDelete.mockResolvedValueOnce({});
    await collectionsApi.unbookmark("c1");
    expect(mockDelete).toHaveBeenCalledWith("/collections/c1/bookmark");
  });

  it("getRating calls GET /collections/:id/rating", async () => {
    const data = { averageStars: 4.5, count: 10 };
    mockGet.mockResolvedValueOnce({ data });
    const result = await collectionsApi.getRating("c1");
    expect(mockGet).toHaveBeenCalledWith("/collections/c1/rating");
    expect(result).toEqual(data);
  });

  it("setRating calls POST /collections/:id/rating with stars", async () => {
    const data = { id: "r1", collectionId: "c1", stars: 5 };
    mockPost.mockResolvedValueOnce({ data });
    const result = await collectionsApi.setRating("c1", 5);
    expect(mockPost).toHaveBeenCalledWith("/collections/c1/rating", { stars: 5 });
    expect(result).toEqual(data);
  });

  it("discover calls GET /collections/discover with params", async () => {
    const data = { collections: [], total: 0 };
    mockGet.mockResolvedValueOnce({ data });
    const result = await collectionsApi.discover({ q: "aws", page: 1, pageSize: 10 });
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("/collections/discover"));
    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain("q=aws");
    expect(result).toEqual(data);
  });

  it("getBookmarks calls GET /collections/bookmarks", async () => {
    const data = { collections: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await collectionsApi.getBookmarks();
    expect(mockGet).toHaveBeenCalledWith("/collections/bookmarks");
    expect(result).toEqual(data);
  });

  it("addItem calls POST /collections/:id/items", async () => {
    mockPost.mockResolvedValueOnce({});
    await collectionsApi.addItem("c1", { itemId: "i1" });
    expect(mockPost).toHaveBeenCalledWith("/collections/c1/items", { itemId: "i1" });
  });

  it("removeItem calls DELETE /collections/:id/items/:itemId", async () => {
    mockDelete.mockResolvedValueOnce({});
    await collectionsApi.removeItem("c1", "i1");
    expect(mockDelete).toHaveBeenCalledWith("/collections/c1/items/i1");
  });

  it("getCollectionsForItem calls GET /items/:id/collections", async () => {
    const data = { collections: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await collectionsApi.getCollectionsForItem("i1");
    expect(mockGet).toHaveBeenCalledWith("/items/i1/collections");
    expect(result).toEqual(data);
  });
});
