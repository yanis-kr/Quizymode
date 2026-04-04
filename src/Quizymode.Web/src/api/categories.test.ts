import { beforeEach, describe, expect, it, vi } from "vitest";
import { categoriesApi } from "./categories";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("./client", () => ({
  apiClient: { get: mockGet },
}));

describe("categoriesApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll calls GET /categories without params when no search", async () => {
    const data = { categories: [] };
    mockGet.mockResolvedValueOnce({ data });

    const result = await categoriesApi.getAll();

    expect(mockGet).toHaveBeenCalledWith("/categories", { params: {} });
    expect(result).toEqual(data);
  });

  it("getAll calls GET /categories with search param when provided", async () => {
    const data = { categories: [{ id: "1", category: "AWS" }] };
    mockGet.mockResolvedValueOnce({ data });

    const result = await categoriesApi.getAll("AWS");

    expect(mockGet).toHaveBeenCalledWith("/categories", { params: { search: "AWS" } });
    expect(result).toEqual(data);
  });
});
