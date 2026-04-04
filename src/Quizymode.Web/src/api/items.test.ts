import { beforeEach, describe, expect, it, vi } from "vitest";
import { itemsApi } from "./items";

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

describe("itemsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll calls GET /items with default pagination", async () => {
    const data = { items: [], total: 0 };
    mockGet.mockResolvedValueOnce({ data });
    const result = await itemsApi.getAll();
    expect(mockGet).toHaveBeenCalledWith("/items", expect.objectContaining({ params: expect.objectContaining({ page: 1, pageSize: 10 }) }));
    expect(result).toEqual(data);
  });

  it("getAll passes category param when provided", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [] } });
    await itemsApi.getAll("geography");
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.category).toBe("geography");
  });

  it("getAll passes keywords as comma-joined string", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [] } });
    await itemsApi.getAll(undefined, undefined, ["capitals", "europe"]);
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.keywords).toBe("capitals,europe");
  });

  it("getAll omits keywords param when empty array", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [] } });
    await itemsApi.getAll(undefined, undefined, []);
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.keywords).toBeUndefined();
  });

  it("getAll passes navigationKeywords as nav param", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [] } });
    await itemsApi.getAll(undefined, undefined, undefined, undefined, undefined, 1, 10, { navigationKeywords: ["capitals"] });
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.nav).toBe("capitals");
  });

  it("getAll passes collectionId when provided", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [] } });
    await itemsApi.getAll(undefined, undefined, undefined, "col-1");
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.collectionId).toBe("col-1");
  });

  it("getAll passes isRandom when provided", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [] } });
    await itemsApi.getAll(undefined, undefined, undefined, undefined, true);
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.isRandom).toBe(true);
  });

  it("getById calls GET /items/:id", async () => {
    const data = { id: "i1", question: "Q?" };
    mockGet.mockResolvedValueOnce({ data });
    const result = await itemsApi.getById("i1");
    expect(mockGet).toHaveBeenCalledWith("/items/i1");
    expect(result).toEqual(data);
  });

  it("getRandom calls GET /items with isRandom flag", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [{ id: "i1" }] } });
    const result = await itemsApi.getRandom("geography", 5, ["capitals"]);
    expect(mockGet).toHaveBeenCalledWith("/items", expect.objectContaining({
      params: expect.objectContaining({ isRandom: true, pageSize: 5, category: "geography", keywords: "capitals" }),
    }));
    expect(result).toEqual({ items: [{ id: "i1" }] });
  });

  it("create calls POST /items with data", async () => {
    const payload = { question: "Q?", correctAnswer: "A", incorrectAnswers: [] };
    const data = { id: "new", ...payload };
    mockPost.mockResolvedValueOnce({ data });
    const result = await itemsApi.create(payload as never);
    expect(mockPost).toHaveBeenCalledWith("/items", payload);
    expect(result).toEqual(data);
  });

  it("update calls PUT /items/:id", async () => {
    const data = { id: "i1", question: "Updated?" };
    mockPut.mockResolvedValueOnce({ data });
    const result = await itemsApi.update("i1", { question: "Updated?" } as never);
    expect(mockPut).toHaveBeenCalledWith("/items/i1", { question: "Updated?" });
    expect(result).toEqual(data);
  });

  it("delete calls DELETE /items/:id", async () => {
    mockDelete.mockResolvedValueOnce({});
    await itemsApi.delete("i1");
    expect(mockDelete).toHaveBeenCalledWith("/items/i1");
  });

  it("bulkCreate calls POST /items/bulk", async () => {
    const data = { created: 3, skipped: 1 };
    mockPost.mockResolvedValueOnce({ data });
    const result = await itemsApi.bulkCreate({ items: [] } as never);
    expect(mockPost).toHaveBeenCalledWith("/items/bulk", expect.any(Object));
    expect(result).toEqual(data);
  });

  it("uploadToCollection calls POST /items/upload-to-collection", async () => {
    const data = { collectionId: "c1", name: "Col", itemCount: 5 };
    mockPost.mockResolvedValueOnce({ data });
    const payload = {
      category: "geography",
      keyword1: "capitals",
      keyword2: "europe",
      keywords: [],
      items: [],
      inputText: "[]",
    };
    const result = await itemsApi.uploadToCollection(payload);
    expect(mockPost).toHaveBeenCalledWith("/items/upload-to-collection", payload);
    expect(result).toEqual(data);
  });

  it("setVisibility calls PUT /items/:id/visibility", async () => {
    const data = { id: "i1", isPrivate: true };
    mockPut.mockResolvedValueOnce({ data });
    const result = await itemsApi.setVisibility("i1", true);
    expect(mockPut).toHaveBeenCalledWith("/items/i1/visibility", { isPrivate: true });
    expect(result).toEqual(data);
  });
});
