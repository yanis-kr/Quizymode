import { describe, expect, it } from "vitest";
import { learnEventContext } from "./learnAnalytics";

describe("learnEventContext", () => {
  it("prefixes the collection id", () => {
    expect(learnEventContext({ kind: "collection", collectionId: "11111111-1111-4111-8111-111111111111" })).toEqual({
      contextType: "learn",
      contextId: "collection:11111111-1111-4111-8111-111111111111",
    });
  });

  it("prefixes a category name that fits the id pattern and drops one that does not", () => {
    const scope = { kind: "category" as const, navigationKeywords: [], filterKeywords: [], quizSize: 10 };
    expect(learnEventContext({ ...scope, category: "science" })).toEqual({ contextType: "learn", contextId: "category:science" });
    expect(learnEventContext({ ...scope, category: "World History" })).toEqual({ contextType: "learn" });
  });

  it("has no id for the global scope", () => {
    expect(
      learnEventContext({ kind: "global", category: null, navigationKeywords: [], filterKeywords: [], quizSize: 10 }),
    ).toEqual({ contextType: "learn" });
  });
});
