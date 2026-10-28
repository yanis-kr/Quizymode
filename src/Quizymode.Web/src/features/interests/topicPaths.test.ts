import { describe, expect, it } from "vitest";
import { isTopicPath, mergeTopics, topicBrowsePath, topicLabel, topicsOverlap } from "./topicPaths";

describe("refined topic identity", () => {
  it("bounds canonical paths and detects parent overlaps without confusing siblings", () => {
    expect(isTopicPath("languages/french/core")).toBe(true);
    for (const path of ["languages//core", "languages/french/core/extra", "languages/" + "x".repeat(31)]) expect(isTopicPath(path)).toBe(false);
    expect(topicsOverlap("languages/french", "languages/french/core")).toBe(true);
    expect(topicsOverlap("languages/french", "languages/french-grammar")).toBe(false);
  });
  it("preserves the account refinement when claiming a broader guest pick", () => {
    expect(mergeTopics(["languages/french"], ["languages", "languages/german", "history"])).toEqual(["languages/french", "languages/german", "history"]);
  });
  it("keeps all navigation segments in labels and links", () => {
    expect(topicLabel("languages/french/core")).toBe("Languages › French › Core");
    expect(topicBrowsePath("languages/french/core")).toBe("/categories/languages/french/core");
  });
});
