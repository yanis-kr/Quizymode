import { describe, expect, it } from "vitest";
import { getResultAnalyticsContext, getResultPath, type SearchRowData } from "./searchResultLinks";

const ID = "3f2c1c1e-0000-4000-8000-000000000001";

describe("getResultPath", () => {
  it("maps every result type to its route", () => {
    const cases: Array<[SearchRowData, string]> = [
      [{ type: "category", value: { slug: "tech", name: "tech", description: null, itemCount: 1 } }, "/categories/tech"],
      [
        { type: "subcategory", value: { categorySlug: "tech", l1: "ai-ml", l2: null, description: null, itemCount: 1 } },
        "/categories/tech/ai-ml",
      ],
      [
        { type: "subcategory", value: { categorySlug: "tech", l1: "ai-ml", l2: "llms", description: null, itemCount: 1 } },
        "/categories/tech/ai-ml/llms",
      ],
      [
        { type: "collection", value: { id: ID, name: "Intro to AI", description: null, itemCount: 3 } },
        `/collections/${ID}/intro+to+ai`,
      ],
      [
        { type: "question", value: { id: ID, snippet: { text: "q", highlights: [] }, categorySlug: null, l1: null, l2: null } },
        `/items/${ID}`,
      ],
      [{ type: "mine", value: { kind: "collection", id: ID, title: "My set" } }, `/collections/${ID}/my+set`],
      [{ type: "mine", value: { kind: "studyGuideDocument", id: ID, title: "Notes" } }, `/study-guides/documents/${ID}`],
      [{ type: "mine", value: { kind: "item", id: ID, title: "My question" } }, `/items/${ID}`],
    ];

    for (const [row, expected] of cases) {
      expect(getResultPath(row)).toBe(expected);
    }
  });
});

describe("getResultAnalyticsContext", () => {
  it("sends an id for public targets and none for the callers own content", () => {
    expect(
      getResultAnalyticsContext({ type: "category", value: { slug: "tech", name: "tech", description: null, itemCount: 0 } })
    ).toEqual({ contextType: "category", contextId: "tech" });
    expect(
      getResultAnalyticsContext({ type: "collection", value: { id: ID, name: "n", description: null, itemCount: 0 } })
    ).toEqual({ contextType: "collection", contextId: ID });
    expect(getResultAnalyticsContext({ type: "mine", value: { kind: "item", id: ID, title: "secret" } })).toEqual({
      contextType: "mine",
    });
  });
});
