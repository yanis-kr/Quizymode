import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SUGGEST_TEXT_LENGTH, taxonomyApi } from "./taxonomy";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock("./client", () => ({
  apiClient: { get: mockGet, post: mockPost },
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

  describe("suggest", () => {
    const suggestion = {
      categorySlug: "tech",
      l1: "ai-ml",
      l2: "deep-learning",
      path: "tech › ai-ml › deep-learning",
      description: "Neural nets",
      score: 0.73,
      matchedTerms: ["neural", "network"],
      reason: "text",
    };

    it("posts the text in the body and returns the parsed suggestions", async () => {
      mockPost.mockResolvedValueOnce({ data: { suggestions: [suggestion] } });
      const controller = new AbortController();

      const result = await taxonomyApi.suggest("neural networks", { limit: 3, signal: controller.signal });

      expect(mockPost).toHaveBeenCalledWith(
        "/taxonomy/suggest",
        { text: "neural networks", limit: 3 },
        { signal: controller.signal },
      );
      expect(result.suggestions[0].l2).toBe("deep-learning");
    });

    it("caps the text at 5,000 characters", async () => {
      mockPost.mockResolvedValueOnce({ data: { suggestions: [] } });

      await taxonomyApi.suggest("x".repeat(6000));

      expect(mockPost.mock.calls[0][1].text).toHaveLength(MAX_SUGGEST_TEXT_LENGTH);
    });

    it("accepts the fallback reasons", async () => {
      mockPost.mockResolvedValueOnce({
        data: { suggestions: [{ ...suggestion, reason: "yours", score: 0, matchedTerms: [] }, { ...suggestion, reason: "popular", score: 0, matchedTerms: [] }] },
      });

      const result = await taxonomyApi.suggest("");

      expect(result.suggestions.map((entry) => entry.reason)).toEqual(["yours", "popular"]);
    });

    it("rejects a response with an unknown reason", async () => {
      mockPost.mockResolvedValueOnce({ data: { suggestions: [{ ...suggestion, reason: "magic" }] } });

      await expect(taxonomyApi.suggest("text")).rejects.toThrow();
    });

    it("rejects a response without a leaf", async () => {
      const withoutLeaf: Record<string, unknown> = { ...suggestion };
      delete withoutLeaf.l2;
      mockPost.mockResolvedValueOnce({ data: { suggestions: [withoutLeaf] } });

      await expect(taxonomyApi.suggest("text")).rejects.toThrow();
    });
  });
});
