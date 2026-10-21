import { describe, expect, it } from "vitest";
import {
  buildCategoryShare,
  buildCollectionShare,
  buildDailyShare,
  buildGlobalShare,
  buildRunShare,
  scoreTier,
  shareCopyText,
} from "./resultShare";

const ORIGIN = "https://www.quizymode.com";

describe("scoreTier", () => {
  it.each([
    [0, "practice"],
    [49, "practice"],
    [50, "good"],
    [79, "good"],
    [80, "great"],
    [99, "great"],
    [100, "perfect"],
  ])("maps %i%% to %s", (percentage, id) => {
    expect(scoreTier(percentage, 10)?.id).toBe(id);
  });

  it("has no tier for an empty run", () => {
    expect(scoreTier(0, 0)).toBeNull();
  });
});

describe("result share builders", () => {
  it("builds the public collection message and campaign link", () => {
    const share = buildCollectionShare({
      correct: 8,
      total: 10,
      collection: { id: "c-1", name: "Cloud Basics", isPublic: true },
      origin: ORIGIN,
    });
    expect(share.text).toBe('I scored 8/10 on "Cloud Basics" on Quizymode. Can you beat me?');
    expect(share.url).toBe(
      `${ORIGIN}/quiz/collections/c-1/cloud+basics?utm_source=share&utm_medium=share&utm_campaign=quiz_result&utm_content=collection`
    );
    expect(share.isPrivateCollection).toBeUndefined();
  });

  it.each([
    ["private", { id: "c-1", name: "Secret Deck", isPublic: false }],
    ["unknown visibility", { id: "c-1", name: "Secret Deck" }],
    ["still loading", null],
  ])("fails closed for a %s collection: score only, no name, id or slug", (_label, collection) => {
    const share = buildCollectionShare({ correct: 3, total: 4, collection, origin: ORIGIN });
    expect(share.text).toBe("I scored 3/4 on a Quizymode quiz.");
    expect(share.url).toBeUndefined();
    expect(share.isPrivateCollection).toBe(true);
    expect(JSON.stringify(share)).not.toMatch(/Secret|secret|c-1/);
  });

  it("builds category and global messages without keywords", () => {
    const category = buildCategoryShare({ correct: 5, total: 10, category: "AWS Certs", origin: ORIGIN });
    expect(category.text).toBe("I scored 5/10 on a AWS Certs quiz on Quizymode. Try this quiz!");
    expect(category.url).toBe(
      `${ORIGIN}/quiz/aws-certs?utm_source=share&utm_medium=share&utm_campaign=quiz_result&utm_content=category`
    );
    const global = buildGlobalShare({ correct: 2, total: 3, origin: ORIGIN });
    expect(global.text).toBe("I scored 2/3 on a Quizymode quiz. Try this quiz!");
    expect(global.url).toBe(`${ORIGIN}/quiz?utm_source=share&utm_medium=share&utm_campaign=quiz_result&utm_content=global`);
  });

  it("builds the daily grid in roster order", () => {
    const share = buildDailyShare({ date: "2026-10-20", results: [true, false, true, true], origin: ORIGIN });
    expect(share.text).toBe("Quizymode Daily 2026-10-20 3/4\n\u{1F7E9}\u{1F7E5}\u{1F7E9}\u{1F7E9}");
    expect(shareCopyText(share)).toBe(
      `${share.text}\n${ORIGIN}/daily?utm_source=share&utm_medium=share&utm_campaign=quiz_result&utm_content=daily`
    );
  });

  it("picks the builder from the run scope", () => {
    const common = { correct: 1, total: 2, origin: ORIGIN, collection: undefined };
    expect(
      buildRunShare({ ...common, scope: { kind: "global", category: null, navigationKeywords: [], filterKeywords: [], quizSize: 2 } }).kind
    ).toBe("global");
    expect(
      buildRunShare({
        ...common,
        scope: { kind: "category", category: "Math", navigationKeywords: ["a"], filterKeywords: ["b"], quizSize: 2 },
      }).url
    ).not.toMatch(/keywords|nav=|search/);
    expect(buildRunShare({ ...common, scope: { kind: "collection", collectionId: "c-1" } }).isPrivateCollection).toBe(true);
  });
});
