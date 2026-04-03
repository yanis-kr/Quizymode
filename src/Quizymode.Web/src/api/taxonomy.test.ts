import { beforeEach, describe, expect, it, vi } from "vitest";
import { taxonomyApi } from "./taxonomy";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("./client", () => ({
  apiClient: { get: mockGet },
}));

describe("taxonomyApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll calls GET /taxonomy", async () => {
    const data = { categories: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await taxonomyApi.getAll();
    expect(mockGet).toHaveBeenCalledWith("/taxonomy");
    expect(result).toEqual(data);
  });

  it("getAll returns full taxonomy response", async () => {
    const data = {
      categories: [
        {
          slug: "geography",
          name: "Geography",
          description: null,
          itemCount: 100,
          groups: [],
          allKeywordSlugs: [],
        },
      ],
    };
    mockGet.mockResolvedValueOnce({ data });
    const result = await taxonomyApi.getAll();
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].slug).toBe("geography");
  });
});
