import { beforeEach, describe, expect, it, vi } from "vitest";
import { keywordsApi } from "./keywords";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("./client", () => ({
  apiClient: { get: mockGet },
}));

describe("keywordsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getNavigationKeywords calls GET /keywords with category", async () => {
    const data = { keywords: [] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await keywordsApi.getNavigationKeywords("geography");
    expect(mockGet).toHaveBeenCalledWith("/keywords", { params: { category: "geography" } });
    expect(result).toEqual(data);
  });

  it("getNavigationKeywords includes selectedKeywords as comma-joined string", async () => {
    mockGet.mockResolvedValueOnce({ data: { keywords: [] } });
    await keywordsApi.getNavigationKeywords("geography", ["capitals", "europe"]);
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.selectedKeywords).toBe("capitals,europe");
  });

  it("getNavigationKeywords omits selectedKeywords when empty", async () => {
    mockGet.mockResolvedValueOnce({ data: { keywords: [] } });
    await keywordsApi.getNavigationKeywords("geography", []);
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.selectedKeywords).toBeUndefined();
  });

  it("getItemTagKeywords calls GET /keywords/item-tags with category", async () => {
    const data = { names: ["tag1", "tag2"] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await keywordsApi.getItemTagKeywords("geography");
    expect(mockGet).toHaveBeenCalledWith("/keywords/item-tags", { params: { category: "geography" } });
    expect(result).toEqual(data);
  });

  it("getKeywordDescriptions calls GET /keywords/descriptions", async () => {
    const data = { keywords: [{ name: "capitals", description: "Capital cities" }] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await keywordsApi.getKeywordDescriptions("geography", ["capitals"]);
    expect(mockGet).toHaveBeenCalledWith("/keywords/descriptions", {
      params: { category: "geography", keywords: "capitals" },
    });
    expect(result).toEqual(data);
  });

  it("getKeywordDescriptions omits keywords param when empty array", async () => {
    mockGet.mockResolvedValueOnce({ data: { keywords: [] } });
    await keywordsApi.getKeywordDescriptions("geography", []);
    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.keywords).toBeUndefined();
  });
});
